/**
 * Client-side scheduling engine.
 * Handles time recalculation, validation, and travel matrix lookups
 * so that drag-and-drop never breaks constraints silently.
 */

// ─── Time helpers ───

export function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(m) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function addMinutes(time, mins) {
  return minutesToTime(timeToMinutes(time) + mins);
}

// ─── Travel matrix ───

/**
 * Builds a lookup map from the backend's enriched response.
 * Call once after schedule generation; reuse on every edit.
 *
 * travelData: Map-like entries from backend, or we build from activities + haversine.
 * Returns: { get(fromId, toId) → minutes }
 */
export function buildTravelMatrix(activities) {
  const coords = new Map(activities.map((a) => [a.place_id, { lat: a.lat, lng: a.lng }]));

  return {
    get(fromId, toId) {
      const a = coords.get(fromId);
      const b = coords.get(toId);
      if (!a || !b) return 10; // fallback
      // Haversine → walking estimate (5 km/h)
      const distKm = haversine(a, b);
      return Math.max(5, Math.ceil((distKm / 5) * 60)); // min 5 min
    },
  };
}

function haversine(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// ─── Day recalculation ───

const DAY_START = '09:00';
const DAY_END = '21:30';
const BUFFER_MIN = 10; // minimum cushion between activities (travel + this buffer)

/**
 * Given a day's items (in order), recomputes start_time and end_time
 * for each item sequentially: respecting duration + travel time.
 *
 * Mutates items in place. Returns the day object.
 */
export function recalculateDay(day, travelMatrix) {
  let currentTime = DAY_START;

  for (let i = 0; i < day.items.length; i++) {
    const item = day.items[i];

    // Add travel time + buffer from previous activity
    if (i > 0) {
      const prev = day.items[i - 1];
      const travel = travelMatrix.get(prev.place_id, item.place_id);
      currentTime = addMinutes(currentTime, travel + BUFFER_MIN);
    }

    item.start_time = currentTime;
    item.end_time = addMinutes(currentTime, item.duration || 75);
    currentTime = item.end_time;
  }

  return day;
}

// ─── Local validation ───

/**
 * Validates a single day's schedule. Returns { errors: [], warnings: [] }
 * per item, plus day-level issues.
 */
export function validateDay(day, travelMatrix) {
  const dayIssues = [];

  // Annotate each item with its own warnings/errors
  for (let i = 0; i < day.items.length; i++) {
    const item = day.items[i];
    item.errors = [];
    item.warnings = [];

    const startMin = timeToMinutes(item.start_time);
    const endMin = timeToMinutes(item.end_time);

    // Too early
    if (startMin < timeToMinutes(DAY_START)) {
      item.warnings.push(`Starts at ${item.start_time}, before ${DAY_START}`);
    }

    // Too late
    if (endMin > timeToMinutes(DAY_END)) {
      item.warnings.push(`Ends at ${item.end_time}, after ${DAY_END}`);
    }

      // Travel feasibility — only flag when there is genuinely not enough time to travel
      if (i > 0) {
        const prev = day.items[i - 1];
        const prevEndMin = timeToMinutes(prev.end_time);

        if (startMin < prevEndMin) {
          item.errors.push(`Overlaps with "${prev.name}" (ends ${prev.end_time})`);
        }

        const travel = travelMatrix.get(prev.place_id, item.place_id);
        const gap = startMin - prevEndMin;
        if (gap >= 0 && gap < travel) {
          item.errors.push(`${gap}min gap but ${travel}min travel from "${prev.name}"`);
        }
        // (No tight-buffer warning — BUFFER_MIN is already baked into the recalculation)
      }
  }

  // Day-level: too many activities
  if (day.items.length > 5) {
    dayIssues.push({ severity: 'warning', message: `${day.items.length} activities (max recommended: 5)` });
  }

  // Day-level: overflows day end
  if (day.items.length > 0) {
    const lastEnd = timeToMinutes(day.items[day.items.length - 1].end_time);
    if (lastEnd > timeToMinutes(DAY_END)) {
      dayIssues.push({ severity: 'warning', message: `Day runs until ${day.items[day.items.length - 1].end_time}` });
    }
  }

  const hasErrors = day.items.some((it) => it.errors.length > 0);

  return { valid: !hasErrors, dayIssues };
}

// ─── Full itinerary operations ───

/**
 * After any user edit, call this to recalculate + revalidate all affected days.
 * Returns a new itinerary object (immutable update).
 */
export function recalcAndValidate(itinerary, travelMatrix, affectedDayIndices = null) {
  const days = itinerary.days.map((day, i) => {
    if (affectedDayIndices && !affectedDayIndices.includes(i)) return day;
    const updated = recalculateDay({ ...day, items: day.items.map((it) => ({ ...it })) }, travelMatrix);
    const { valid, dayIssues } = validateDay(updated, travelMatrix);
    return { ...updated, valid, dayIssues };
  });

  const allValid = days.every((d) => d.valid !== false);

  return { ...itinerary, days, validation: { valid: allValid } };
}

/**
 * Reorder items within a day (drag-and-drop result).
 */
export function reorderInDay(itinerary, dayIndex, oldIndex, newIndex, travelMatrix) {
  const days = itinerary.days.map((d) => ({ ...d, items: [...d.items] }));
  const items = days[dayIndex].items;
  const [moved] = items.splice(oldIndex, 1);
  items.splice(newIndex, 0, moved);
  return recalcAndValidate({ ...itinerary, days }, travelMatrix, [dayIndex]);
}

/**
 * Move an item from one day to another.
 */
export function moveAcrossDays(itinerary, fromDay, fromIndex, toDay, toIndex, travelMatrix) {
  const days = itinerary.days.map((d) => ({ ...d, items: [...d.items] }));
  const [moved] = days[fromDay].items.splice(fromIndex, 1);
  days[toDay].items.splice(toIndex, 0, moved);
  return recalcAndValidate({ ...itinerary, days }, travelMatrix, [fromDay, toDay]);
}

/**
 * Remove an item from a day.
 */
export function removeItem(itinerary, dayIndex, itemIndex, travelMatrix) {
  const days = itinerary.days.map((d) => ({ ...d, items: [...d.items] }));
  days[dayIndex].items.splice(itemIndex, 1);
  return recalcAndValidate({ ...itinerary, days }, travelMatrix, [dayIndex]);
}
