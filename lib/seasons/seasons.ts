import 'server-only';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Seasons as data (migration 0055). Every program's season_key points at
 * seasons.key; the admin manager owns the list. Status is DERIVED from the
 * dates — never stored — so a season flips upcoming -> active -> ended on its
 * own and archiving is the only manual state.
 */

export interface Season {
  id: number;
  key: string;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  archived: boolean;
  status: 'upcoming' | 'active' | 'ended' | 'archived' | 'undated';
  programCount: number;
}

function statusOf(s: { starts_on: string | null; ends_on: string | null; archived: boolean }): Season['status'] {
  if (s.archived) return 'archived';
  if (!s.starts_on || !s.ends_on) return 'undated';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
  if (today < s.starts_on) return 'upcoming';
  if (today > s.ends_on) return 'ended';
  return 'active';
}

export async function listSeasons(opts: { includeArchived?: boolean } = {}): Promise<Season[]> {
  const db = supabaseAdmin();
  let q = db.from('seasons').select('id, key, name, starts_on, ends_on, archived').order('starts_on', { ascending: false, nullsFirst: false });
  if (!opts.includeArchived) q = q.eq('archived', false);
  const { data } = await q;
  const rows = data ?? [];
  const counts = new Map<string, number>();
  if (rows.length) {
    const { data: progs } = await db.from('programs').select('season_key').in('season_key', rows.map((r) => r.key));
    for (const p of progs ?? []) counts.set(p.season_key!, (counts.get(p.season_key!) ?? 0) + 1);
  }
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    archived: r.archived,
    status: statusOf(r),
    programCount: counts.get(r.key) ?? 0,
  }));
}

export async function createSeason(
  input: { key: string; name: string; startsOn: string | null; endsOn: string | null },
  actorClerkId: string,
): Promise<number> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('seasons')
    .insert({ key: input.key.trim(), name: input.name.trim(), starts_on: input.startsOn, ends_on: input.endsOn })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'season.create', target: `season:${data.id}`, meta: { ...input } });
  return data.id;
}

/** Renaming updates the display name only; the key is stable because programs
 *  point at it. Changing dates just moves the derived status. */
export async function updateSeason(
  id: number,
  input: { name: string; startsOn: string | null; endsOn: string | null },
  actorClerkId: string,
): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from('seasons')
    .update({ name: input.name.trim(), starts_on: input.startsOn, ends_on: input.endsOn })
    .eq('id', id);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'season.update', target: `season:${id}`, meta: { ...input } });
}

export async function setSeasonArchived(id: number, archived: boolean, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from('seasons').update({ archived }).eq('id', id);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: archived ? 'season.archive' : 'season.restore', target: `season:${id}`, meta: {} });
}
