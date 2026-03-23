import { useEffect, useRef } from 'react';

const STORAGE_KEY = 'trip-planner-draft';

/**
 * Persists planning progress to localStorage.
 * Saves: step, tripConfig, selectedActivities, itinerary.
 * Debounced — writes at most once per second.
 */
export function useLocalDraft({ step, tripConfig, selectedActivities, itinerary }) {
  const timer = useRef(null);

  // Save on change (debounced)
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        const draft = { step, tripConfig, selectedActivities, itinerary, savedAt: Date.now() };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      } catch {}
    }, 1000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [step, tripConfig, selectedActivities, itinerary]);
}

/**
 * Loads a saved draft from localStorage.
 * Returns null if no draft or if draft is older than 7 days.
 */
export function loadDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    // Expire after 7 days
    if (Date.now() - draft.savedAt > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function clearDraft() {
  localStorage.removeItem(STORAGE_KEY);
}
