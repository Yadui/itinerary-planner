import express from 'express';
import 'dotenv/config';

const router = express.Router();
const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Search places by city + interest category
router.get('/search', async (req, res) => {
  const { city, interest } = req.query;
  if (!city) return res.status(400).json({ error: 'city is required' });

  const query = interest ? `${interest} in ${city}` : `top attractions in ${city}`;
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.status !== 'OK') return res.status(502).json({ error: data.status, details: data.error_message });

    const places = data.results.map((p) => ({
      id: p.place_id,
      name: p.name,
      rating: p.rating,
      userRatingsTotal: p.user_ratings_total,
      address: p.formatted_address,
      priceLevel: p.price_level,
      types: p.types,
      photo: p.photos?.[0]
        ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${p.photos[0].photo_reference}&key=${GOOGLE_KEY}`
        : null,
      location: p.geometry?.location,
    }));

    res.json(places);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Autocomplete suggestions for cities
router.get('/autocomplete/city', async (req, res) => {
  const { input } = req.query;
  if (!input || input.length < 2) return res.json([]);

  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&types=(cities)&key=${GOOGLE_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return res.status(502).json({ error: data.status });
    }
    res.json((data.predictions || []).map((p) => ({
      placeId: p.place_id,
      description: p.description,
      mainText: p.structured_formatting?.main_text,
      secondaryText: p.structured_formatting?.secondary_text,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Autocomplete suggestions for hotels/addresses
router.get('/autocomplete/address', async (req, res) => {
  const { input, city } = req.query;
  if (!input || input.length < 2) return res.json([]);

  let url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&types=establishment|geocode&key=${GOOGLE_KEY}`;
  // Bias results toward the city if provided
  if (city) url += `&components=&input=${encodeURIComponent(input + ' ' + city)}`;

  // Simpler: just search with city context baked into input
  const biasedUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(city ? `${input}, ${city}` : input)}&types=establishment|geocode&key=${GOOGLE_KEY}`;

  try {
    const response = await fetch(biasedUrl);
    const data = await response.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return res.status(502).json({ error: data.status });
    }
    res.json((data.predictions || []).map((p) => ({
      placeId: p.place_id,
      description: p.description,
      mainText: p.structured_formatting?.main_text,
      secondaryText: p.structured_formatting?.secondary_text,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get place details (lat/lng) by place_id
router.get('/details', async (req, res) => {
  const { place_id } = req.query;
  if (!place_id) return res.status(400).json({ error: 'place_id required' });

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(place_id)}&fields=geometry,formatted_address,name&key=${GOOGLE_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.status !== 'OK') return res.status(502).json({ error: data.status });
    const r = data.result;
    res.json({
      name: r.name,
      address: r.formatted_address,
      location: r.geometry?.location,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
