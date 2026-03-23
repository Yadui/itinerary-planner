import { z } from 'zod';
import { aiChat } from './ai.js';

// Zod schema for schedule response
const ScheduleItemSchema = z.object({
  place_id: z.string(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
});

const ScheduleDaySchema = z.object({
  date: z.string(),
  city: z.string().optional(),
  items: z.array(ScheduleItemSchema),
});

const ScheduleResponseSchema = z.object({
  days: z.array(ScheduleDaySchema),
});

function buildPrompt(trip, activities, travelTimes) {
  const activityList = activities.map((a) => {
    const hoursStr = a.opening_hours
      ? ` | Hours: ${JSON.stringify(a.opening_hours)}`
      : '';
    const cityStr = a.city ? ` | city: "${a.city}"` : '';
    return `  - place_id: "${a.place_id}" | name: "${a.name}" | duration: ${a.duration}min | lat: ${a.lat}, lng: ${a.lng}${cityStr}${hoursStr}`;
  }).join('\n');

  const travelEntries = [];
  for (const [key, val] of travelTimes.entries()) {
    travelEntries.push(`  ${key}: ${val.duration_minutes}min`);
  }
  const travelStr = travelEntries.slice(0, 60).join('\n');

  // Build city-date schedule if available
  let citySchedule = '';
  if (trip.cities?.length) {
    citySchedule = `\nCITY SCHEDULE (the user is in each city on these dates — respect arrival/departure times!):\n`;
    citySchedule += trip.cities.map((c) => {
      let line = `  - ${c.name}: ${c.arrival} to ${c.departure}`;
      if (c.arrivalTime) line += ` | arrives at ${c.arrivalTime} on ${c.arrival}`;
      if (c.departureTime) line += ` | departs at ${c.departureTime} on ${c.departure}`;
      return line;
    }).join('\n');
    citySchedule += '\n';
  }

  return `You are a trip scheduling system. Create a realistic day-by-day schedule.

INPUT:
- Start date: ${trip.start_date}
- End date: ${trip.end_date}
- Stay location: lat ${trip.stay_location.lat}, lng ${trip.stay_location.lng}
${citySchedule}
ACTIVITIES:
${activityList}

TRAVEL TIMES (minutes):
${travelStr}

RULES:
- CRITICAL: Only schedule activities in a city on dates when the user is IN that city (see CITY SCHEDULE above). If an activity belongs to Ho Chi Minh, it can ONLY appear on Ho Chi Minh dates.
- CRITICAL: If the user arrives at a city late (e.g. 23:30), do NOT schedule any activities before a reasonable time after arrival. For a late-night arrival, start activities the NEXT day. For a morning arrival (e.g. 08:00), allow activities starting 1-2 hours after arrival.
- CRITICAL: If the user departs a city at a certain time, do NOT schedule activities that would end after the departure time. Leave at least 1 hour buffer before departure for travel to the station/airport.
- If no activities exist for a city, create a day entry with an empty items array for each date in that city.
- Max 5 activities per day
- Respect opening hours when provided
- Include travel time between activities — the next activity cannot start before the previous one ends PLUS travel time
- Start day at 09:00, end by 21:00
- Do NOT invent activities — only use provided place_id values
- Allocate each activity its full duration
- Group geographically nearby activities on the same day

OUTPUT:
Return ONLY valid JSON inside <json></json> tags. No explanation.
Include ALL dates from start to end, even if a day has no activities (empty items array).

FORMAT:
<json>
{
  "days": [
    {
      "date": "YYYY-MM-DD",
      "city": "City Name",
      "items": [
        {
          "place_id": "...",
          "start_time": "HH:MM",
          "end_time": "HH:MM"
        }
      ]
    }
  ]
}
</json>`;
}

/**
 * Calls AI provider to generate a schedule, then parses + validates with Zod.
 */
export async function generateSchedule(trip, activities, travelTimes) {
  const prompt = buildPrompt(trip, activities, travelTimes);

  const { text: raw, provider } = await aiChat({ prompt, maxTokens: 4096 });
  console.log(`Schedule generated via ${provider}`);

  // Extract JSON from <json> tags
  const jsonMatch = raw.match(/<json>([\s\S]*?)<\/json>/);
  if (!jsonMatch) {
    const fallback = raw.match(/\{[\s\S]*\}/);
    if (!fallback) {
      throw new Error('AI returned no parseable JSON');
    }
    const parsed = JSON.parse(fallback[0]);
    const validated = ScheduleResponseSchema.parse(parsed);
    return { schedule: validated, raw };
  }

  const parsed = JSON.parse(jsonMatch[1]);
  const validated = ScheduleResponseSchema.parse(parsed);

  // Post-process: enforce city-date + transport time constraints
  const enforced = enforceConstraints(validated, trip, activities);

  return { schedule: enforced, raw };
}

/**
 * Post-process AI schedule to enforce hard constraints:
 * 1. Activities only on days when user is in that city
 * 2. No activities before arrival time (+ buffer)
 * 3. No activities after departure time (- buffer)
 */
function enforceConstraints(schedule, trip, activities) {
  if (!trip.cities?.length) return schedule;

  // Build a map: date → { city, earliestStart, latestEnd }
  const dateConstraints = new Map();
  for (const city of trip.cities) {
    if (!city.arrival || !city.departure) continue;
    const start = new Date(city.arrival + 'T00:00:00');
    const end = new Date(city.departure + 'T00:00:00');
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      const constraint = { city: city.name, earliestStart: '09:00', latestEnd: '21:00' };

      // Arrival day: if arrivalTime is late, push start to next reasonable time
      if (dateStr === city.arrival && city.arrivalTime) {
        const [h, m] = city.arrivalTime.split(':').map(Number);
        const arrivalMinutes = h * 60 + m;
        if (arrivalMinutes >= 22 * 60) {
          // Arrived at 10pm+ → no activities this day
          constraint.earliestStart = '23:59';
        } else if (arrivalMinutes >= 12 * 60) {
          // Arrived afternoon → start 1.5h after
          const startMin = arrivalMinutes + 90;
          constraint.earliestStart = `${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`;
        } else {
          // Morning arrival → start 1h after
          const startMin = arrivalMinutes + 60;
          constraint.earliestStart = `${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`;
        }
      }

      // Departure day: cut off 1h before departure
      if (dateStr === city.departure && city.departureTime) {
        const [h, m] = city.departureTime.split(':').map(Number);
        const cutoffMin = Math.max(0, h * 60 + m - 60);
        constraint.latestEnd = `${String(Math.floor(cutoffMin / 60)).padStart(2, '0')}:${String(cutoffMin % 60).padStart(2, '0')}`;
      }

      dateConstraints.set(dateStr, constraint);
    }
  }

  // Build activity city map
  const activityCity = new Map();
  for (const a of activities) {
    if (a.city) activityCity.set(a.place_id, a.city);
  }

  // Enforce
  for (const day of schedule.days) {
    const constraint = dateConstraints.get(day.date);
    if (!constraint) continue;

    // Set city if missing
    if (!day.city) day.city = constraint.city;

    // Remove activities from wrong city
    day.items = day.items.filter((item) => {
      const itemCity = activityCity.get(item.place_id);
      if (itemCity && itemCity !== constraint.city) return false;
      return true;
    });

    // Remove activities outside time bounds
    day.items = day.items.filter((item) => {
      if (item.start_time < constraint.earliestStart) return false;
      if (item.end_time > constraint.latestEnd) return false;
      return true;
    });
  }

  return schedule;
}
