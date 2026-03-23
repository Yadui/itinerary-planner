import 'dotenv/config';

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;

// In-memory cache: "lat,lng-lat,lng-mode" → { duration_minutes, distance_meters }
const travelCache = new Map();

function cacheKey(origin, destination, mode) {
  return `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}-${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}-${mode}`;
}

/**
 * Returns travel time in minutes between two {lat, lng} points.
 * Uses Google Directions API, cached per origin-destination-mode triple.
 */
export async function getTravelTime(origin, destination, mode = 'walking') {
  const key = cacheKey(origin, destination, mode);
  if (travelCache.has(key)) return travelCache.get(key);

  const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
  url.searchParams.set('origin', `${origin.lat},${origin.lng}`);
  url.searchParams.set('destination', `${destination.lat},${destination.lng}`);
  url.searchParams.set('mode', mode); // walking, driving, transit, bicycling
  url.searchParams.set('key', GOOGLE_KEY);

  // Retry up to 2 times on network failures
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
      const data = await res.json();

      if (data.status !== 'OK' || !data.routes?.length) {
        break; // API responded but no route — use fallback
      }

      const leg = data.routes[0].legs[0];
      const result = {
        duration_minutes: Math.ceil(leg.duration.value / 60),
        distance_meters: leg.distance.value,
        estimated: false,
      };
      travelCache.set(key, result);
      return result;
    } catch (err) {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      // All retries failed — fall through to haversine
    }
  }

  // Fallback: estimate ~5km/h walking, ~30km/h driving
  const distKm = haversine(origin, destination);
  const speedKmh = mode === 'walking' ? 5 : mode === 'transit' ? 25 : 30;
  const fallback = { duration_minutes: Math.ceil((distKm / speedKmh) * 60), distance_meters: Math.round(distKm * 1000), estimated: true };
  travelCache.set(key, fallback);
  return fallback;
}

/**
 * Batch-computes travel times for an ordered list of activities.
 * Returns a map: "placeIdA->placeIdB" → travel result.
 * Also computes stay → first activity per day.
 */
export async function batchTravelTimes(activities, stayLocation, mode = 'walking') {
  const results = new Map();
  const tasks = [];

  // Stay → each activity
  for (const act of activities) {
    const key = `stay->${act.place_id}`;
    tasks.push(
      getTravelTime(stayLocation, { lat: act.lat, lng: act.lng }, mode)
        .then((r) => results.set(key, r))
    );
  }

  // Between each pair of activities (sequential, not full cartesian)
  for (let i = 0; i < activities.length; i++) {
    for (let j = i + 1; j < activities.length; j++) {
      const a = activities[i];
      const b = activities[j];
      const keyAB = `${a.place_id}->${b.place_id}`;
      const keyBA = `${b.place_id}->${a.place_id}`;
      tasks.push(
        getTravelTime({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }, mode)
          .then((r) => {
            results.set(keyAB, r);
            results.set(keyBA, r); // symmetric for walking/driving
          })
      );
    }
  }

  // Process in batches of 10 to avoid connection resets
  const BATCH_SIZE = 10;
  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    await Promise.all(tasks.slice(i, i + BATCH_SIZE));
  }
  return results;
}

/** Haversine distance in km */
function haversine(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
