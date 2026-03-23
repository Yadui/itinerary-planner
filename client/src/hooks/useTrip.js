import { useState, useEffect, useCallback, useRef } from 'react';
import { recalcAndValidate, buildTravelMatrix } from '../lib/scheduler';

const BASE = '/api';

async function authedRequest(path, accessToken, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${BASE}${path}`, { headers, ...options });
  if (res.status === 409) {
    const data = await res.json();
    const err = new Error('version_conflict');
    err.currentVersion = data.currentVersion;
    throw err;
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/**
 * Manages trip lifecycle: create, load, save, dirty state.
 * Supports optimistic locking and conflict-safe retry.
 */
export function useTrip(tripId, accessToken) {
  const [trip, setTrip] = useState(null);
  const [activities, setActivities] = useState([]);
  const [itinerary, setItinerary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved' | 'conflict_resolved' | 'skipped'
  const versionRef = useRef(1);

  const autoSaveTimer = useRef(null);

  // ─── Load ───
  const loadTrip = useCallback(async () => {
    if (!tripId || !accessToken) return;
    setLoading(true);
    setError(null);

    try {
      const data = await authedRequest(`/trips/${tripId}`, accessToken);
      setTrip(data.trip);
      setActivities(data.activities);
      versionRef.current = data.trip.version || 1;

      const tm = buildTravelMatrix(data.activities);
      const validated = recalcAndValidate(data.itinerary, tm);
      setItinerary(validated);
      setIsDirty(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tripId, accessToken]);

  useEffect(() => { loadTrip(); }, [loadTrip]);

  // ─── Unsaved changes warning ───
  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(e) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // ─── Mark dirty ───
  const markDirty = useCallback(() => {
    setIsDirty(true);

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (tripId && accessToken) {
        saveTrip();
      }
    }, 3000); // 3s debounce for collab
  }, [tripId, accessToken]);

  // ─── Update itinerary ───
  const updateItinerary = useCallback((newItinerary) => {
    setItinerary(newItinerary);
    markDirty();
  }, [markDirty]);

  // ─── Save with conflict retry ───
  const saveTrip = useCallback(async (retryCount = 0) => {
    if (!tripId || !accessToken || saving) return;
    setSaving(true);
    setError(null);
    setSaveStatus('saving');

    try {
      const result = await authedRequest(`/trips/${tripId}`, accessToken, {
        method: 'PUT',
        body: JSON.stringify({
          trip,
          activities,
          version: versionRef.current,
          itinerary: itinerary ? {
            days: itinerary.days.map((day) => ({
              date: day.date,
              city: day.city,
              items: day.items.map((item) => ({
                place_id: item.place_id,
                start_time: item.start_time,
                end_time: item.end_time,
              })),
            })),
          } : null,
        }),
      });
      versionRef.current = result.version || versionRef.current + 1;
      setIsDirty(false);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      if (err.message === 'version_conflict' && retryCount < 2) {
        // Fetch latest, merge, retry
        try {
          const latest = await authedRequest(`/trips/${tripId}`, accessToken);
          versionRef.current = latest.trip.version;
          setTrip(latest.trip);
          // Keep local activities and itinerary (our changes take precedence)
          setSaving(false);
          setSaveStatus('conflict_resolved');
          setTimeout(() => setSaveStatus(null), 3000);
          // Retry with updated version
          await saveTrip(retryCount + 1);
          return;
        } catch (mergeErr) {
          setError('Trip updated by someone else. Please refresh.');
          setSaveStatus(null);
        }
      } else if (err.message === 'version_conflict') {
        setError('Trip updated frequently. Please refresh and retry.');
        setSaveStatus(null);
        // Force refresh
        await loadTrip();
      } else {
        setError(err.message);
        setSaveStatus(null);
      }
    } finally {
      setSaving(false);
    }
  }, [tripId, accessToken, trip, activities, itinerary, saving, loadTrip]);

  // ─── Create ───
  const createTrip = useCallback(async (tripData) => {
    if (!accessToken) throw new Error('Must be signed in to save');
    const result = await authedRequest('/trips', accessToken, {
      method: 'POST',
      body: JSON.stringify(tripData),
    });
    return result.id;
  }, [accessToken]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  return {
    trip,
    activities,
    itinerary,
    loading,
    saving,
    error,
    isDirty,
    saveStatus,
    updateItinerary,
    saveTrip,
    createTrip,
    setTrip,
    setActivities,
    setItinerary,
    markDirty,
    loadTrip,
  };
}
