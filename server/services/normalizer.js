/**
 * Estimates how long (in minutes) a user typically spends at a place,
 * based on its Google Place types.
 */
function estimateDuration(types = []) {
  if (types.includes('restaurant') || types.includes('cafe') || types.includes('bar')) return 90;
  if (types.includes('museum') || types.includes('art_gallery')) return 120;
  if (types.includes('park') || types.includes('zoo') || types.includes('amusement_park')) return 120;
  if (types.includes('church') || types.includes('place_of_worship')) return 45;
  if (types.includes('shopping_mall') || types.includes('department_store')) return 90;
  if (types.includes('tourist_attraction') || types.includes('point_of_interest')) return 90;
  if (types.includes('night_club')) return 120;
  if (types.includes('spa')) return 120;
  if (types.includes('movie_theater') || types.includes('stadium')) return 150;
  return 75; // default
}

/**
 * Normalizes a raw Google Places result into our internal format.
 * Every downstream system (scheduling, validation, directions) uses this shape.
 */
export function normalizePlace(place) {
  const lat = place.lat ?? place.location?.lat ?? place.geometry?.location?.lat ?? null;
  const lng = place.lng ?? place.location?.lng ?? place.geometry?.location?.lng ?? null;

  return {
    place_id: place.id ?? place.place_id,
    name: place.name,
    lat,
    lng,
    rating: place.rating ?? null,
    user_ratings_total: place.userRatingsTotal ?? place.user_ratings_total ?? null,
    price_level: place.priceLevel ?? place.price_level ?? null,
    types: place.types ?? [],
    opening_hours: place.opening_hours ?? null,
    address: place.address ?? place.formatted_address ?? null,
    photo: place.photo ?? null,
    city: place.city ?? null,
    duration: estimateDuration(place.types),
  };
}

/**
 * Normalizes an array of places, filtering out any without coordinates.
 */
export function normalizePlaces(places) {
  return places.map(normalizePlace).filter((p) => p.lat != null && p.lng != null);
}
