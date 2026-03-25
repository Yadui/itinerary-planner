import { useState, useEffect, useCallback, useRef } from 'react';
import {
  recalcAndValidate,
  buildTravelMatrix,
  reorderInDay,
  moveAcrossDays,
  removeItem,
} from '../lib/scheduler';

const BASE = '/api';
const MAX_UNDO = 20;

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
 * Apply a single pending operation against a latest-from-server itinerary.
 * Returns the new itinerary, or null if the op can't be applied (entity missing).
 */
function applyOp(itin, op, travelMatrix) {
  if (!itin?.days) return null;

  switch (op.op) {
    case 'reorder': {
      const dayIdx = itin.days.findIndex((d) => d.dayId === op.dayId);
      if (dayIdx === -1) return null;
      const day = itin.days[dayIdx];
      // Verify all itemIds still exist in this day
      const currentIds = day.items.map((it) => it.place_id);
      if (!op.itemIds.every((id) => currentIds.includes(id))) return null;
      // Build new order
      const oldIdx = currentIds.indexOf(op.itemIds[0]);
      const newIdx = currentIds.indexOf(op.itemIds[1]);
      if (oldIdx === -1 || newIdx === -1) return null;
      return reorderInDay(itin, dayIdx, oldIdx, newIdx, travelMatrix);
    }
    case 'move': {
      const fromIdx = itin.days.findIndex((d) => d.dayId === op.fromDayId);
      const toIdx = itin.days.findIndex((d) => d.dayId === op.toDayId);
      if (fromIdx === -1 || toIdx === -1) return null;
      const itemIdx = itin.days[fromIdx].items.findIndex((it) => it.place_id === op.itemId);
      if (itemIdx === -1) return null;
      return moveAcrossDays(itin, fromIdx, itemIdx, toIdx, itin.days[toIdx].items.length, travelMatrix);
    }
    case 'remove': {
      for (let di = 0; di < itin.days.length; di++) {
        const ii = itin.days[di].items.findIndex((it) => it.place_id === op.itemId);
        if (ii !== -1) return removeItem(itin, di, ii, travelMatrix);
      }
      return null; // already removed
    }
    default:
      return null;
  }
}

/**
 * Manages trip lifecycle: create, load, save, dirty state.
 * Supports optimistic locking, conflict-safe retry with operation replay, and undo.
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
  const [canUndo, setCanUndo] = useState(false);
  const versionRef = useRef(1);

  const autoSaveTimer = useRef(null);
  const undoStack = useRef([]); // { itinerary, activities } snapshots
  const pendingOps = useRef([]); // operation log since last save
  const isDirtyRef = useRef(false);

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
      undoStack.current = [];
      pendingOps.current = [];
      setCanUndo(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tripId, accessToken]);

  useEffect(() => { loadTrip(); }, [loadTrip]);

  // Keep isDirtyRef in sync for use in event listeners
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);

  // ─── Auto-refresh on tab return after inactivity ───
  useEffect(() => {
    if (!tripId || !accessToken) return;
    let hiddenAt = null;

    function handleVisibility() {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else if (hiddenAt && Date.now() - hiddenAt > 60000 && !isDirtyRef.current) {
        loadTrip();
        hiddenAt = null;
      }
    }

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [tripId, accessToken, loadTrip]);

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

  // ─── Push undo snapshot ───
  const pushUndo = useCallback(() => {
    undoStack.current.push({
      itinerary: JSON.parse(JSON.stringify(itinerary)),
      activities: JSON.parse(JSON.stringify(activities)),
    });
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();
    setCanUndo(true);
  }, [itinerary, activities]);

  // ─── Undo ───
  const undo = useCallback(() => {
    if (!undoStack.current.length) return;
    const snapshot = undoStack.current.pop();
    setItinerary(snapshot.itinerary);
    setActivities(snapshot.activities);
    setIsDirty(true);
    setCanUndo(undoStack.current.length > 0);
    // Remove last pending op
    pendingOps.current.pop();
  }, []);

  // ─── Mark dirty + schedule autosave ───
  const markDirty = useCallback(() => {
    setIsDirty(true);

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (tripId && accessToken) {
        saveTrip();
      }
    }, 3000);
  }, [tripId, accessToken]);

  // ─── Update itinerary (with undo + op tracking) ───
  const updateItinerary = useCallback((newItinerary, op) => {
    pushUndo();
    setItinerary(newItinerary);
    if (op) pendingOps.current.push(op);
    markDirty();
  }, [pushUndo, markDirty]);

  // ─── Update activities ───
  const updateActivities = useCallback((newActivities) => {
    pushUndo();
    setActivities(newActivities);
    markDirty();
  }, [pushUndo, markDirty]);

  // ─── Update trip config (cities, dates, transport) ───
  const updateTripConfig = useCallback((newConfig) => {
    pushUndo();
    setTrip((prev) => {
      if (!prev) return prev;
      const cities = newConfig.cities || [];
      const name = cities.map((c) => c.name).filter(Boolean).join(' → ') || prev.name;
      return {
        ...prev,
        name,
        start_date: cities[0]?.arrival || prev.start_date,
        end_date: cities[cities.length - 1]?.departure || prev.end_date,
        config: newConfig,
      };
    });
    markDirty();
  }, [pushUndo, markDirty]);

  // ─── Save with conflict retry + operation replay ───
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
              dayId: day.dayId,
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
      pendingOps.current = []; // clear ops on success
      setIsDirty(false);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      if (err.message === 'version_conflict' && retryCount < 2) {
        // Smart merge: fetch latest, replay pending ops
        try {
          const latest = await authedRequest(`/trips/${tripId}`, accessToken);
          versionRef.current = latest.trip.version;
          setTrip(latest.trip);

          const ops = [...pendingOps.current];
          let merged = latest.itinerary;
          let skipped = 0;

          if (merged && ops.length > 0) {
            const tm = buildTravelMatrix(latest.activities);
            merged = recalcAndValidate(merged, tm);

            for (const op of ops) {
              const result = applyOp(merged, op, tm);
              if (result) {
                merged = result;
              } else {
                skipped++;
              }
            }
          }

          // Use merged itinerary if we had ops, otherwise keep local
          if (ops.length > 0 && merged) {
            setItinerary(merged);
          }

          setSaving(false);
          pendingOps.current = [];

          if (skipped > 0) {
            setSaveStatus('skipped');
            setTimeout(() => setSaveStatus(null), 4000);
          } else {
            setSaveStatus('conflict_resolved');
            setTimeout(() => setSaveStatus(null), 3000);
          }

          // Retry with merged state
          await saveTrip(retryCount + 1);
          return;
        } catch (mergeErr) {
          setError('Trip updated by someone else. Please refresh.');
          setSaveStatus(null);
        }
      } else if (err.message === 'version_conflict') {
        setError('Trip updated frequently. Please refresh and retry.');
        setSaveStatus(null);
        pendingOps.current = [];
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
    canUndo,
    updateItinerary,
    updateActivities,
    updateTripConfig,
    saveTrip,
    createTrip,
    setTrip,
    setActivities,
    setItinerary,
    markDirty,
    loadTrip,
    undo,
  };
}
