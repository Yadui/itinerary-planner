import express from 'express';
import 'dotenv/config';
import { normalizePlaces } from '../services/normalizer.js';
import { batchTravelTimes } from '../services/directions.js';
import { generateSchedule } from '../services/claude.js';
import { validateSchedule } from '../services/scheduleValidator.js';

const router = express.Router();

/**
 * POST /api/schedule/generate
 *
 * Request body:
 * {
 *   trip: { start_date, end_date, stay_location: { lat, lng } },
 *   activities: [ { place_id, name, lat, lng, types, rating, ... } ],
 *   travel_mode?: "walking" | "driving" | "transit"
 * }
 *
 * Response:
 * {
 *   days: [ { date, city?, items: [ { place_id, start_time, end_time } ] } ],
 *   validation: { valid: boolean, issues: Issue[] },
 *   activities: normalized activity list (for client reference)
 * }
 */
router.post('/generate', async (req, res) => {
  const { trip, activities, travel_mode } = req.body;

  // Input validation
  if (!trip?.start_date || !trip?.end_date || !trip?.stay_location) {
    return res.status(400).json({ error: 'trip.start_date, trip.end_date, and trip.stay_location are required' });
  }
  if (!activities?.length) {
    return res.status(400).json({ error: 'At least one activity is required' });
  }

  try {
    // 1. Normalize places into strict internal format
    const normalized = normalizePlaces(activities);
    if (!normalized.length) {
      return res.status(400).json({ error: 'No activities with valid coordinates' });
    }

    // 2. Batch-compute travel times (cached)
    const mode = travel_mode || 'walking';
    const travelTimes = await batchTravelTimes(normalized, trip.stay_location, mode);

    // 3. Generate schedule via Claude (with Zod validation)
    const { schedule } = await generateSchedule(trip, normalized, travelTimes);

    // 4. Validate against constraints
    const validation = validateSchedule(schedule, normalized, travelTimes);

    // 5. Enrich schedule items with activity names for the client
    const activityMap = new Map(normalized.map((a) => [a.place_id, a]));
    const enrichedDays = schedule.days.map((day) => ({
      ...day,
      items: day.items.map((item) => {
        const act = activityMap.get(item.place_id);
        return {
          ...item,
          name: act?.name ?? 'Unknown',
          duration: act?.duration ?? null,
          rating: act?.rating ?? null,
          address: act?.address ?? null,
        };
      }),
    }));

    res.json({
      days: enrichedDays,
      validation,
      activities: normalized,
    });
  } catch (err) {
    console.error('Schedule generation failed:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/schedule/optimize-day
 *
 * Re-optimizes a single day only. Keeps the same activities,
 * reorders + reschedules for efficiency.
 *
 * Request: { date, activities: [...], stay_location: { lat, lng } }
 * Response: { items: [ { place_id, start_time, end_time } ] }
 */
router.post('/optimize-day', async (req, res) => {
  const { date, activities, stay_location } = req.body;

  if (!date || !activities?.length || !stay_location) {
    return res.status(400).json({ error: 'date, activities, and stay_location are required' });
  }

  try {
    const normalized = normalizePlaces(activities);
    if (!normalized.length) {
      return res.status(400).json({ error: 'No activities with valid coordinates' });
    }

    const travelTimes = await batchTravelTimes(normalized, stay_location, 'walking');

    // Single-day trip object
    const trip = { start_date: date, end_date: date, stay_location };
    const { schedule } = await generateSchedule(trip, normalized, travelTimes);

    // Return just the items from the first (only) day
    const dayItems = schedule.days?.[0]?.items ?? [];

    // Enrich with names
    const activityMap = new Map(normalized.map((a) => [a.place_id, a]));
    const enriched = dayItems.map((item) => {
      const act = activityMap.get(item.place_id);
      return {
        ...item,
        name: act?.name ?? 'Unknown',
        duration: act?.duration ?? null,
      };
    });

    res.json({ items: enriched });
  } catch (err) {
    console.error('Day optimization failed:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
