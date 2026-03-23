import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import tripRoutes from './routes/trip.js';
import placesRoutes from './routes/places.js';
import scheduleRoutes from './routes/schedule.js';
import extractRoutes from './routes/extract.js';
import { checkProviders } from './services/ai.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/ping', (req, res) => res.json({ ok: true }));

// Health check — tests connectivity to Google Places API and AI providers
app.get('/api/health', async (req, res) => {
  const results = { server: { ok: true }, google: { ok: false }, claude: { ok: false }, azure: { ok: false } };

  // Google Places API check
  try {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      results.google = { ok: false, error: 'API key not configured' };
    } else {
      const r = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=test&key=${key}`);
      const data = await r.json();
      results.google = { ok: data.status === 'OK' || data.status === 'ZERO_RESULTS', status: data.status };
    }
  } catch (err) {
    results.google = { ok: false, error: err.message };
  }

  // AI providers check
  try {
    const ai = await checkProviders();
    results.claude = ai.claude;
    results.azure = ai.azure;
  } catch (err) {
    results.claude = { ok: false, error: err.message };
    results.azure = { ok: false, error: err.message };
  }

  res.json(results);
});
app.use('/api/trips', tripRoutes);
app.use('/api/places', placesRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/extract', extractRoutes);

// In Vercel, the app is imported as a handler — don't listen
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

export default app;
