/**
 * Supabase clients (Module 0) — server-only, import from
 * '@ai/foundation/supabase'.
 *
 * The portal runs its OWN Supabase project (see README "Architecture
 * decisions"). Auth is Clerk, so app code talks to the DB through the
 * service-role client from the server; RLS stays enabled on every table with
 * no anon policies, making the public anon key inert. Never import this from
 * client components.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _admin: SupabaseClient | null = null;

/** Service-role client (bypasses RLS — server code only). */
export function supabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
  }
  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Next.js patches global fetch with request caching; without no-store,
      // supabase-js GETs (storage lists, PostgREST reads) can return stale
      // cached responses across requests. Opt every Supabase call out.
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  });
  return _admin;
}
