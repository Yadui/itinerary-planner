import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

let _client = null;

export function getSupabase() {
  if (_client) return _client;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY must be set in .env');
  }
  _client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  return _client;
}

/**
 * Returns a Supabase client scoped to the user's JWT.
 * This ensures RLS policies are enforced.
 */
export function getSupabaseForUser(accessToken) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY must be set in .env');
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
