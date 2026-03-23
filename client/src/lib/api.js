const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function authedRequest(path, accessToken, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${BASE}${path}`, { headers, ...options });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  ping: () => request('/ping'),
  searchPlaces: (city, interest) =>
    request(`/places/search?city=${encodeURIComponent(city)}&interest=${encodeURIComponent(interest || '')}`),
  generateSchedule: (payload) =>
    request('/schedule/generate', { method: 'POST', body: JSON.stringify(payload) }),
  createTrip: (payload) =>
    request('/trips', { method: 'POST', body: JSON.stringify(payload) }),
  getTrip: (id) => request(`/trips/${id}`),
  optimizeDay: (payload) =>
    request('/schedule/optimize-day', { method: 'POST', body: JSON.stringify(payload) }),
  extractActivities: (text, cities) =>
    request('/extract/activities', { method: 'POST', body: JSON.stringify({ text, cities }) }),
  extractInstagramUrl: (url, cities) =>
    request('/extract/instagram-url', { method: 'POST', body: JSON.stringify({ url, cities }) }),
  listTrips: (accessToken) => authedRequest('/trips', accessToken),
  loadTrip: (id, accessToken) => authedRequest(`/trips/${id}`, accessToken),
};
