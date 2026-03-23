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

  return { schedule: validated, raw };
}
