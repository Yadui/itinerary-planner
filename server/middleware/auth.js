import { getSupabase } from '../services/supabase.js';

/**
 * Express middleware: extracts Bearer token, verifies with Supabase,
 * attaches req.user and req.accessToken.
 */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = header.slice(7);

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = data.user;
    req.accessToken = token;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Auth verification failed' });
  }
}

/**
 * Optional auth: attaches user if token present, but doesn't block.
 * Used for public routes like shared trip view.
 */
export async function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = header.slice(7);
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getUser(token);
    req.user = data?.user ?? null;
    req.accessToken = token;
  } catch {
    req.user = null;
  }
  next();
}
