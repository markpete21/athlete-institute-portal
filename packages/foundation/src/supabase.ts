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

// --- result helpers ---------------------------------------------------------
//
// supabase-js never throws: every call resolves to `{ data, error }`. Code that
// destructures only `data` silently proceeds after a failed write, which is how
// half-applied money and state changes happen. These two helpers make the
// failure mode explicit at the call site:
//
//   ok(await db.from('t').update(...).eq(...), 'thing.update')       // throws on error
//   const row = must(await db.from('t').select().maybeSingle(), 'x')  // + non-null
//   const list = rows(await db.from('t').select('id'), 'thing.list')  // + [] default
//
// `ctx` names the operation in the thrown message so logs read as prose.

export interface PostgrestLike<T> {
  data: T;
  error: { message: string; code?: string } | null;
}

export class DbError extends Error {
  constructor(readonly ctx: string, readonly cause_: { message: string; code?: string }) {
    super(`${ctx}: ${cause_.message}`);
    this.name = 'DbError';
  }
  get code(): string | undefined {
    return this.cause_.code;
  }
}

/** Throw if the result carries an error; return data (possibly null). */
export function ok<T>(result: PostgrestLike<T>, ctx: string): T {
  if (result.error) throw new DbError(ctx, result.error);
  return result.data;
}

/** Throw if the result carries an error OR no data (a row was expected). */
export function must<T>(result: PostgrestLike<T>, ctx: string): NonNullable<T> {
  if (result.error) throw new DbError(ctx, result.error);
  if (result.data === null || result.data === undefined) throw new DbError(ctx, { message: 'not found', code: 'NOT_FOUND' });
  return result.data as NonNullable<T>;
}

/**
 * Escape a user-supplied string for use inside a PostgREST `like`/`ilike`
 * pattern so `%`, `_` and `\` match literally. Use with an exact-match
 * intent: `.ilike('email', likeLiteral(email))` is a case-insensitive `=`.
 */
export function likeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** Throw if the result carries an error; return the rows (`[]` when PostgREST sent none). */
export function rows<T>(result: PostgrestLike<T[] | null>, ctx: string): T[] {
  if (result.error) throw new DbError(ctx, result.error);
  return result.data ?? [];
}

/**
 * Sanitise a free-text search term for use inside a PostgREST `.or()` filter
 * string (`first_name.ilike.%TERM%,…`). Commas, parentheses and dots are
 * filter grammar there, so they (and `like` wildcards) are stripped rather
 * than escaped. Returns '' when nothing searchable remains.
 */
export function searchTerm(raw: string | null | undefined, max = 60): string {
  return (raw ?? '')
    .replace(/[,()%_*\\."']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
