import 'server-only';
import {
  currentSeason,
} from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Staff insights: ratings (from Module 15 feedback), tenure stats, review log,
 * and re-registration rates per coach.
 */

// --- Ratings (from Module 15 feedback) ----------------------------------------

/**
 * Star ratings per staff member, aggregated from Module 15 program feedback.
 * A response rates the program experience, so it counts for every coach who
 * PUBLICLY delivered it (show_public assignments; hidden substitutes are
 * excluded). Reviews are collected and coordinated by the Feedback module -
 * this is a read-only rollup.
 */
export async function staffRatings(staffIds: number[]): Promise<Map<number, { avg: number; count: number }>> {
  const out = new Map<number, { avg: number; count: number }>();
  if (!staffIds.length) return out;
  const db = supabaseAdmin();
  const { data: assigns } = await db.from('staff_assignments').select('staff_id, program_id').in('staff_id', staffIds).eq('show_public', true);
  const programIds = [...new Set((assigns ?? []).map((a) => a.program_id))];
  if (!programIds.length) return out;
  const { data: responses } = await db.from('feedback_responses').select('program_id, rating').in('program_id', programIds).not('rating', 'is', null);
  const byProgram = new Map<number, number[]>();
  for (const r of responses ?? []) {
    const list = byProgram.get(r.program_id) ?? [];
    list.push(r.rating!);
    byProgram.set(r.program_id, list);
  }
  const pooled = new Map<number, number[]>();
  for (const a of assigns ?? []) {
    const ratings = byProgram.get(a.program_id);
    if (!ratings?.length) continue;
    pooled.set(a.staff_id, [...(pooled.get(a.staff_id) ?? []), ...ratings]);
  }
  for (const [staffId, ratings] of pooled) {
    out.set(staffId, { avg: Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10, count: ratings.length });
  }
  return out;
}

// --- Tenure stats --------------------------------------------------------------

/** '2026:may-aug' -> a comparable index (3 seasons per year, in calendar order). */
function seasonIndex(seasonKey: string): number | null {
  const m = seasonKey.match(/^(\d{4}):(jan-apr|may-aug|sep-dec)$/);
  if (!m) return null;
  return Number(m[1]) * 3 + ['jan-apr', 'may-aug', 'sep-dec'].indexOf(m[2]);
}

export interface StaffStats {
  /** Earliest assignment start (starts_on, falling back to when it was recorded). */
  startDate: string | null;
  /** Distinct seasons they've worked (from their programs' season keys). */
  totalSeasons: number;
  /** Consecutive-season run counting back from their most recent season. */
  consecutiveSeasons: number;
}

export async function staffStats(staffIds: number[]): Promise<Map<number, StaffStats>> {
  const out = new Map<number, StaffStats>();
  if (!staffIds.length) return out;
  const { data: assigns } = await supabaseAdmin()
    .from('staff_assignments')
    .select('staff_id, starts_on, created_at, programs(season_key)')
    .in('staff_id', staffIds);

  const byStaff = new Map<number, { starts: string[]; seasons: Set<number> }>();
  for (const a of assigns ?? []) {
    const cur = byStaff.get(a.staff_id) ?? { starts: [], seasons: new Set<number>() };
    cur.starts.push(a.starts_on ?? a.created_at.slice(0, 10));
    const key = (a.programs as unknown as { season_key: string | null } | null)?.season_key;
    const idx = key ? seasonIndex(key) : null;
    if (idx !== null) cur.seasons.add(idx);
    byStaff.set(a.staff_id, cur);
  }
  for (const [staffId, v] of byStaff) {
    let streak = 0;
    if (v.seasons.size) {
      let at = Math.max(...v.seasons);
      while (v.seasons.has(at)) { streak++; at--; }
    }
    out.set(staffId, { startDate: v.starts.sort()[0] ?? null, totalSeasons: v.seasons.size, consecutiveSeasons: streak });
  }
  return out;
}

/**
 * One coach's review log: the compiled star rating plus every piece of TYPED
 * feedback from their public programs, newest first. Read-only view over
 * Module 15 responses.
 */
export async function staffReviewLog(staffId: number): Promise<{
  avg: number | null;
  count: number;
  entries: Array<{ programName: string; rating: number; comment: string; submittedAt: string | null }>;
}> {
  const db = supabaseAdmin();
  const { data: assigns } = await db.from('staff_assignments').select('program_id').eq('staff_id', staffId).eq('show_public', true);
  const programIds = [...new Set((assigns ?? []).map((a) => a.program_id))];
  if (!programIds.length) return { avg: null, count: 0, entries: [] };
  const { data: responses } = await db
    .from('feedback_responses')
    .select('rating, comment, submitted_at, programs(name)')
    .in('program_id', programIds)
    .not('rating', 'is', null)
    .order('submitted_at', { ascending: false });
  const all = responses ?? [];
  const avg = all.length ? Math.round((all.reduce((s, r) => s + r.rating!, 0) / all.length) * 10) / 10 : null;
  const entries = all
    .filter((r) => r.comment?.trim())
    .map((r) => ({
      programName: (r.programs as unknown as { name: string } | null)?.name ?? '—',
      rating: r.rating!,
      comment: r.comment!.trim(),
      submittedAt: r.submitted_at,
    }));
  return { avg, count: all.length, entries };
}

// --- Re-registration rate ------------------------------------------------------

/**
 * Per-coach retention: of the players a coach coached in COMPLETED seasons,
 * how many registered for anything again in a later season? Builds over time -
 * programs in the current/future season aren't eligible yet (their players
 * haven't had a chance to re-register), so a new coach shows a dash until
 * their first season closes out.
 */
export async function staffReregistrationRates(staffIds: number[]): Promise<Map<number, { rate: number; eligible: number; returned: number }>> {
  const out = new Map<number, { rate: number; eligible: number; returned: number }>();
  if (!staffIds.length) return out;
  const db = supabaseAdmin();
  const season = currentSeason();
  const nowIdx = seasonIndex(`${season.year}:${season.key}`)!;

  const { data: assigns } = await db.from('staff_assignments').select('staff_id, program_id, programs(season_key)').in('staff_id', staffIds).eq('show_public', true);
  // Programs from completed seasons only, with their season index.
  const pastPrograms = new Map<number, number>(); // program_id -> season idx
  for (const a of assigns ?? []) {
    const key = (a.programs as unknown as { season_key: string | null } | null)?.season_key;
    const idx = key ? seasonIndex(key) : null;
    if (idx !== null && idx < nowIdx) pastPrograms.set(a.program_id, idx);
  }
  if (!pastPrograms.size) return out;

  const { data: regs } = await db.from('registrations').select('program_id, family_member_id').in('program_id', [...pastPrograms.keys()]).eq('status', 'active').not('family_member_id', 'is', null);
  const memberIds = [...new Set((regs ?? []).map((r) => r.family_member_id as number))];
  if (!memberIds.length) return out;

  // Every season each member has ANY active registration in, org-wide.
  const { data: allRegs } = await db.from('registrations').select('family_member_id, programs(season_key)').in('family_member_id', memberIds).eq('status', 'active');
  const seasonsByMember = new Map<number, Set<number>>();
  for (const r of allRegs ?? []) {
    const key = (r.programs as unknown as { season_key: string | null } | null)?.season_key;
    const idx = key ? seasonIndex(key) : null;
    if (idx === null) continue;
    const set = seasonsByMember.get(r.family_member_id as number) ?? new Set<number>();
    set.add(idx);
    seasonsByMember.set(r.family_member_id as number, set);
  }

  // A coached (member, program) pair counts as returned if the member has a
  // registration in ANY season after that program's.
  const regsByProgram = new Map<number, number[]>();
  for (const r of regs ?? []) regsByProgram.set(r.program_id, [...(regsByProgram.get(r.program_id) ?? []), r.family_member_id as number]);
  for (const a of assigns ?? []) {
    const progIdx = pastPrograms.get(a.program_id);
    if (progIdx === undefined) continue;
    const members = regsByProgram.get(a.program_id) ?? [];
    const cur = out.get(a.staff_id) ?? { rate: 0, eligible: 0, returned: 0 };
    for (const m of members) {
      cur.eligible++;
      const seasons = seasonsByMember.get(m);
      if (seasons && [...seasons].some((idx) => idx > progIdx)) cur.returned++;
    }
    out.set(a.staff_id, cur);
  }
  for (const [id, v] of out) {
    if (!v.eligible) out.delete(id);
    else out.set(id, { ...v, rate: Math.round((v.returned / v.eligible) * 100) });
  }
  return out;
}
