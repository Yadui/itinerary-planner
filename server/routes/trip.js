import express from 'express';
import crypto from 'crypto';
import 'dotenv/config';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { getSupabaseForUser, getSupabase } from '../services/supabase.js';

const router = express.Router();

// ─── Create Trip ───
// POST /api/trips
router.post('/', requireAuth, async (req, res) => {
  const sb = getSupabaseForUser(req.accessToken);
  const { name, start_date, end_date, stay_location, config } = req.body;

  if (!start_date || !end_date) {
    return res.status(400).json({ error: 'start_date and end_date are required' });
  }

  const { data, error } = await sb
    .from('trips')
    .insert([{
      user_id: req.user.id,
      name: name || 'Untitled Trip',
      start_date,
      end_date,
      stay_location,
      config,
    }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ─── Save Trip (Full Transactional Save) ───
// PUT /api/trips/:id
// Replaces activities + itinerary atomically
// Supports optimistic locking via version field
router.put('/:id', requireAuth, async (req, res) => {
  const sb = getSupabaseForUser(req.accessToken);
  const tripId = req.params.id;
  const { trip, activities, itinerary, version } = req.body;

  // 1. Verify ownership or editor role
  const { data: existing, error: fetchErr } = await sb
    .from('trips')
    .select('id, user_id, version')
    .eq('id', tripId)
    .single();

  if (fetchErr || !existing) return res.status(404).json({ error: 'Trip not found' });

  const isOwner = existing.user_id === req.user.id;
  if (!isOwner) {
    // Check if collaborator with editor role
    const { data: collab } = await sb
      .from('trip_collaborators')
      .select('role')
      .eq('trip_id', tripId)
      .eq('user_id', req.user.id)
      .single();
    if (!collab || collab.role !== 'editor') {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  // 2. Version conflict check
  if (version !== undefined && version !== existing.version) {
    return res.status(409).json({
      error: 'version_conflict',
      currentVersion: existing.version,
    });
  }

  try {
    // 3. Update trip metadata + bump version
    if (trip) {
      const { error } = await sb
        .from('trips')
        .update({
          name: trip.name,
          start_date: trip.start_date,
          end_date: trip.end_date,
          stay_location: trip.stay_location,
          config: trip.config,
          version: existing.version + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tripId);
      if (error) throw error;
    }

    // 4. Replace activities (delete + insert)
    if (activities) {
      await sb.from('trip_activities').delete().eq('trip_id', tripId);

      if (activities.length > 0) {
        const rows = activities.map((a) => ({
          trip_id: tripId,
          place_id: a.place_id,
          name: a.name,
          lat: a.lat,
          lng: a.lng,
          duration: a.duration,
          metadata: {
            rating: a.rating,
            price_level: a.price_level,
            types: a.types,
            address: a.address,
            photo: a.photo,
            opening_hours: a.opening_hours,
          },
        }));
        const { error } = await sb.from('trip_activities').insert(rows);
        if (error) throw error;
      }
    }

    // 5. Replace itinerary (delete days → cascades items → insert fresh)
    if (itinerary?.days) {
      await sb.from('itinerary_days').delete().eq('trip_id', tripId);

      // Fetch activity UUIDs for foreign keys
      const { data: savedActivities } = await sb
        .from('trip_activities')
        .select('id, place_id')
        .eq('trip_id', tripId);
      const activityUuidMap = new Map(savedActivities.map((a) => [a.place_id, a.id]));

      for (const day of itinerary.days) {
        const { data: dayRow, error: dayErr } = await sb
          .from('itinerary_days')
          .insert([{ trip_id: tripId, date: day.date, city: day.city }])
          .select()
          .single();
        if (dayErr) throw dayErr;

        if (day.items?.length) {
          const itemRows = day.items.map((item, idx) => {
            const actUuid = activityUuidMap.get(item.place_id);
            if (!actUuid) throw new Error(`Activity ${item.place_id} not found after save`);
            return {
              day_id: dayRow.id,
              activity_id: actUuid,
              start_time: item.start_time,
              end_time: item.end_time,
              order_index: idx,
            };
          });
          const { error } = await sb.from('itinerary_items').insert(itemRows);
          if (error) throw error;
        }
      }
    }

    res.json({ ok: true, trip_id: tripId, version: existing.version + 1 });
  } catch (err) {
    console.error('Save failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Load Trip (Full Reconstruction) ───
// GET /api/trips/:id
router.get('/:id', optionalAuth, async (req, res) => {
  const sb = req.accessToken ? getSupabaseForUser(req.accessToken) : getSupabase();
  const tripId = req.params.id;

  try {
    // Fetch trip
    const { data: trip, error: tripErr } = await sb
      .from('trips')
      .select('*')
      .eq('id', tripId)
      .single();
    if (tripErr || !trip) return res.status(404).json({ error: 'Trip not found' });

    // Determine role
    const isOwner = req.user && trip.user_id === req.user.id;
    let role = isOwner ? 'owner' : 'viewer';

    if (!isOwner && req.user) {
      const { data: collab } = await sb
        .from('trip_collaborators')
        .select('role')
        .eq('trip_id', tripId)
        .eq('user_id', req.user.id)
        .single();
      if (collab) role = collab.role;
    }

    // Fetch activities
    const { data: activities } = await sb
      .from('trip_activities')
      .select('*')
      .eq('trip_id', tripId);

    // Fetch days + items
    const { data: days } = await sb
      .from('itinerary_days')
      .select('*, itinerary_items(*)')
      .eq('trip_id', tripId)
      .order('date', { ascending: true });

    // Build activity lookup (UUID → full data)
    const actById = new Map(activities.map((a) => [a.id, a]));

    // Reconstruct client model
    const reconstructedDays = (days || []).map((day) => {
      const sortedItems = (day.itinerary_items || [])
        .sort((a, b) => a.order_index - b.order_index);

      return {
        date: day.date,
        city: day.city,
        items: sortedItems.map((item) => {
          const act = actById.get(item.activity_id);
          return {
            place_id: act?.place_id ?? '',
            name: act?.name ?? 'Unknown',
            lat: act?.lat,
            lng: act?.lng,
            duration: act?.duration ?? 75,
            start_time: item.start_time?.slice(0, 5),
            end_time: item.end_time?.slice(0, 5),
            rating: act?.metadata?.rating ?? null,
            address: act?.metadata?.address ?? null,
            types: act?.metadata?.types ?? [],
          };
        }),
      };
    });

    // Reconstruct activities list
    const activityList = (activities || []).map((a) => ({
      place_id: a.place_id,
      name: a.name,
      lat: a.lat,
      lng: a.lng,
      duration: a.duration,
      rating: a.metadata?.rating ?? null,
      price_level: a.metadata?.price_level ?? null,
      types: a.metadata?.types ?? [],
      address: a.metadata?.address ?? null,
      photo: a.metadata?.photo ?? null,
    }));

    res.json({
      trip: {
        id: trip.id,
        name: trip.name,
        start_date: trip.start_date,
        end_date: trip.end_date,
        stay_location: trip.stay_location,
        config: trip.config,
        version: trip.version,
        role,
        is_owner: isOwner,
      },
      activities: activityList,
      itinerary: { days: reconstructedDays },
    });
  } catch (err) {
    console.error('Load failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── List User's Trips (owned + shared) ───
// GET /api/trips
router.get('/', requireAuth, async (req, res) => {
  const sb = getSupabaseForUser(req.accessToken);

  try {
    // Own trips
    const { data: ownTrips, error: ownErr } = await sb
      .from('trips')
      .select('id, name, start_date, end_date, config, created_at, updated_at')
      .eq('user_id', req.user.id)
      .order('updated_at', { ascending: false });
    if (ownErr) throw ownErr;

    // Shared trips
    const { data: collabs } = await sb
      .from('trip_collaborators')
      .select('trip_id, role')
      .eq('user_id', req.user.id);

    let sharedTrips = [];
    if (collabs?.length) {
      const tripIds = collabs.map((c) => c.trip_id);
      const { data } = await sb
        .from('trips')
        .select('id, name, start_date, end_date, config, created_at, updated_at')
        .in('id', tripIds)
        .order('updated_at', { ascending: false });
      sharedTrips = (data || []).map((t) => {
        const collab = collabs.find((c) => c.trip_id === t.id);
        return { ...t, role: collab?.role || 'viewer', shared: true };
      });
    }

    const allTrips = [
      ...ownTrips.map((t) => ({ ...t, role: 'owner', shared: false })),
      ...sharedTrips,
    ].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    res.json(allTrips);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Delete Trip ───
// DELETE /api/trips/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const sb = getSupabaseForUser(req.accessToken);

  const { error } = await sb
    .from('trips')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ─── Share Trip ───
// POST /api/trips/:id/share
router.post('/:id/share', requireAuth, async (req, res) => {
  const sb = getSupabaseForUser(req.accessToken);
  const tripId = req.params.id;
  const { role } = req.body; // 'editor' or 'viewer'

  // Verify ownership
  const { data: trip } = await sb
    .from('trips')
    .select('id, user_id, share_role')
    .eq('id', tripId)
    .single();
  if (!trip || trip.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the owner can share' });
  }

  const shareRole = role === 'viewer' ? 'viewer' : 'editor';
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await sb
    .from('trips')
    .update({
      share_token: token,
      share_role: shareRole,
      share_token_expires_at: expiresAt,
    })
    .eq('id', tripId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ token, role: shareRole, expires_at: expiresAt });
});

// ─── Revoke Share Link ───
// DELETE /api/trips/:id/share
router.delete('/:id/share', requireAuth, async (req, res) => {
  const sb = getSupabaseForUser(req.accessToken);
  const tripId = req.params.id;

  const { data: trip } = await sb
    .from('trips')
    .select('id, user_id')
    .eq('id', tripId)
    .single();
  if (!trip || trip.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the owner can revoke sharing' });
  }

  const { error } = await sb
    .from('trips')
    .update({ share_token: null, share_token_expires_at: null })
    .eq('id', tripId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ─── Join Trip via Share Token ───
// POST /api/trips/:id/join/:token
router.post('/:id/join/:token', requireAuth, async (req, res) => {
  const sb = getSupabase(); // service-role for cross-user access
  const userSb = getSupabaseForUser(req.accessToken);
  const tripId = req.params.id;
  const token = req.params.token;

  try {
    // Fetch trip with share info
    const { data: trip } = await sb
      .from('trips')
      .select('id, user_id, share_token, share_role, share_token_expires_at')
      .eq('id', tripId)
      .single();

    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (trip.user_id === req.user.id) {
      return res.json({ ok: true, role: 'owner', message: 'You own this trip' });
    }
    if (!trip.share_token || trip.share_token !== token) {
      return res.status(400).json({ error: 'Invalid or expired share link' });
    }
    if (trip.share_token_expires_at && new Date(trip.share_token_expires_at) < new Date()) {
      return res.status(400).json({ error: 'Share link has expired' });
    }

    // Atomic collaborator limit check
    const { data: collabs } = await sb
      .from('trip_collaborators')
      .select('id, user_id')
      .eq('trip_id', tripId);

    // Already a collaborator?
    if (collabs?.some((c) => c.user_id === req.user.id)) {
      return res.json({ ok: true, role: trip.share_role, message: 'Already a collaborator' });
    }

    if ((collabs?.length || 0) >= 5) {
      return res.status(400).json({ error: 'Trip is full (max 5 collaborators)' });
    }

    // Insert collaborator
    const { error } = await sb
      .from('trip_collaborators')
      .insert([{
        trip_id: tripId,
        user_id: req.user.id,
        role: trip.share_role,
      }]);

    if (error) {
      if (error.code === '23505') { // unique violation
        return res.json({ ok: true, role: trip.share_role, message: 'Already a collaborator' });
      }
      throw error;
    }

    res.json({ ok: true, role: trip.share_role });
  } catch (err) {
    console.error('Join failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── List Collaborators ───
// GET /api/trips/:id/collaborators
router.get('/:id/collaborators', requireAuth, async (req, res) => {
  const sb = getSupabaseForUser(req.accessToken);
  const tripId = req.params.id;

  try {
    const { data: trip } = await sb
      .from('trips')
      .select('id, user_id, share_token, share_role, share_token_expires_at')
      .eq('id', tripId)
      .single();
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const { data: collabs } = await sb
      .from('trip_collaborators')
      .select('id, user_id, role, created_at')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true });

    // Fetch user emails via service-role
    const serviceSb = getSupabase();
    const userIds = (collabs || []).map((c) => c.user_id);
    const enriched = [];

    for (const collab of collabs || []) {
      const { data } = await serviceSb.auth.admin.getUserById(collab.user_id);
      enriched.push({
        ...collab,
        email: data?.user?.email || 'Unknown',
      });
    }

    res.json({
      collaborators: enriched,
      share: trip.share_token ? {
        token: trip.share_token,
        role: trip.share_role,
        expires_at: trip.share_token_expires_at,
      } : null,
      is_owner: trip.user_id === req.user.id,
    });
  } catch (err) {
    console.error('List collaborators failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Remove Collaborator ───
// DELETE /api/trips/:id/collaborators/:userId
router.delete('/:id/collaborators/:userId', requireAuth, async (req, res) => {
  const sb = getSupabaseForUser(req.accessToken);
  const tripId = req.params.id;
  const targetUserId = req.params.userId;

  // Only owner can remove others; users can remove themselves
  const { data: trip } = await sb
    .from('trips')
    .select('id, user_id')
    .eq('id', tripId)
    .single();
  if (!trip) return res.status(404).json({ error: 'Trip not found' });

  const isOwner = trip.user_id === req.user.id;
  const isSelf = targetUserId === req.user.id;

  if (!isOwner && !isSelf) {
    return res.status(403).json({ error: 'Only the owner can remove collaborators' });
  }

  const serviceSb = getSupabase();
  const { error } = await serviceSb
    .from('trip_collaborators')
    .delete()
    .eq('trip_id', tripId)
    .eq('user_id', targetUserId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ─── Transfer Ownership ───
// POST /api/trips/:id/transfer
router.post('/:id/transfer', requireAuth, async (req, res) => {
  const sb = getSupabaseForUser(req.accessToken);
  const serviceSb = getSupabase();
  const tripId = req.params.id;
  const { new_owner_id } = req.body;

  const { data: trip } = await sb
    .from('trips')
    .select('id, user_id')
    .eq('id', tripId)
    .single();
  if (!trip || trip.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the owner can transfer' });
  }

  // New owner must be an existing collaborator
  const { data: collab } = await serviceSb
    .from('trip_collaborators')
    .select('id')
    .eq('trip_id', tripId)
    .eq('user_id', new_owner_id)
    .single();
  if (!collab) {
    return res.status(400).json({ error: 'New owner must be a collaborator' });
  }

  try {
    // Transfer: update trip owner, remove new owner from collabs, add old owner as editor
    await serviceSb.from('trips').update({ user_id: new_owner_id }).eq('id', tripId);
    await serviceSb.from('trip_collaborators').delete().eq('trip_id', tripId).eq('user_id', new_owner_id);
    await serviceSb.from('trip_collaborators').insert([{
      trip_id: tripId,
      user_id: req.user.id,
      role: 'editor',
    }]);

    res.json({ ok: true });
  } catch (err) {
    console.error('Transfer failed:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
