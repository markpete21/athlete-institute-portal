import 'server-only';
import { periodStart } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { MAX_FAVOURITES, MAX_PINNED_PROGRAMS, MODULE_BY_KEY, type ModuleKey } from '@/lib/nav/modules';

/**
 * Per-staff navigation preferences for the persistent AdminShell: which modules
 * are pinned to the favourites bar, which programs show key stats in the info
 * band, and whether the rail is minimized. Stored in admin_nav_prefs (0041).
 */

export interface NavPrefs {
  favourites: ModuleKey[];
  pinnedPrograms: number[];
  railMinimized: boolean;
}

const DEFAULT_FAVOURITES: ModuleKey[] = ['programs', 'schedule', 'comms', 'reports'];

export async function getNavPrefs(profileId: number | null): Promise<NavPrefs> {
  if (!profileId) return { favourites: DEFAULT_FAVOURITES, pinnedPrograms: [], railMinimized: false };
  const { data } = await supabaseAdmin()
    .from('admin_nav_prefs')
    .select('favourites, pinned_programs, rail_minimized')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (!data) return { favourites: DEFAULT_FAVOURITES, pinnedPrograms: [], railMinimized: false };
  // Drop any keys that no longer exist in the registry (renamed/removed module).
  const favourites = (data.favourites ?? []).filter((k: string) => MODULE_BY_KEY[k]) as ModuleKey[];
  return {
    favourites: favourites.length ? favourites : DEFAULT_FAVOURITES,
    pinnedPrograms: data.pinned_programs ?? [],
    railMinimized: !!data.rail_minimized,
  };
}

async function save(profileId: number, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('admin_nav_prefs')
    .upsert({ profile_id: profileId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'profile_id' });
  if (error) throw new Error(error.message);
}

/** Pin/unpin a module on the favourites bar (capped at MAX_FAVOURITES). */
export async function toggleFavourite(profileId: number, key: ModuleKey): Promise<NavPrefs> {
  const prefs = await getNavPrefs(profileId);
  let favourites: ModuleKey[];
  if (prefs.favourites.includes(key)) {
    favourites = prefs.favourites.filter((k) => k !== key);
  } else {
    if (prefs.favourites.length >= MAX_FAVOURITES) return prefs; // silently capped
    favourites = [...prefs.favourites, key];
  }
  await save(profileId, { favourites });
  return { ...prefs, favourites };
}

/** Pin/unpin a program in the stats band (capped at MAX_PINNED_PROGRAMS). */
export async function togglePinnedProgram(profileId: number, programId: number): Promise<NavPrefs> {
  const prefs = await getNavPrefs(profileId);
  let pinnedPrograms: number[];
  if (prefs.pinnedPrograms.includes(programId)) {
    pinnedPrograms = prefs.pinnedPrograms.filter((p) => p !== programId);
  } else {
    if (prefs.pinnedPrograms.length >= MAX_PINNED_PROGRAMS) return prefs;
    pinnedPrograms = [...prefs.pinnedPrograms, programId];
  }
  await save(profileId, { pinned_programs: pinnedPrograms });
  return { ...prefs, pinnedPrograms };
}

export async function setRailMinimized(profileId: number, minimized: boolean): Promise<void> {
  await save(profileId, { rail_minimized: minimized });
}

// --- pinned-program key stats (default last 7 days) -------------------------

export interface ProgramStat {
  programId: number;
  name: string;
  location: string | null;
  registrations: number;
  revenueCents: number;
  regDeltaPct: number | null;   // vs the previous equal-length window
  revDeltaPct: number | null;
}

/** Registrations + revenue for a program over the last `days`, with deltas. */
async function statFor(programId: number, days: number): Promise<ProgramStat | null> {
  const db = supabaseAdmin();
  const { data: program } = await db
    .from('programs')
    .select('id, name, locations(name)')
    .eq('id', programId)
    .maybeSingle();
  if (!program) return null;

  const nowISO = new Date().toISOString();
  const period = days <= 7 ? '7d' : days <= 30 ? '30d' : '3mo';
  const startISO = periodStart(period as '7d' | '30d' | '3mo', nowISO);
  const spanMs = Date.parse(nowISO) - Date.parse(startISO);
  const prevStartISO = new Date(Date.parse(startISO) - spanMs).toISOString();

  const count = async (fromISO: string, toISO: string) => {
    const { data } = await db
      .from('registrations')
      .select('id, line_total_cents, created_at')
      .eq('program_id', programId)
      .in('status', ['active', 'waitlisted'])
      .gte('created_at', fromISO)
      .lt('created_at', toISO);
    const rows = data ?? [];
    return { regs: rows.length, revenue: rows.reduce((a, r) => a + (r.line_total_cents ?? 0), 0) };
  };

  const cur = await count(startISO, nowISO);
  const prev = await count(prevStartISO, startISO);
  const delta = (c: number, p: number) => (p === 0 ? null : Math.round(((c - p) / p) * 100));

  return {
    programId,
    name: program.name,
    location: (program.locations as unknown as { name: string } | null)?.name ?? null,
    registrations: cur.regs,
    revenueCents: cur.revenue,
    regDeltaPct: delta(cur.regs, prev.regs),
    revDeltaPct: delta(cur.revenue, prev.revenue),
  };
}

/** Stats for the staff member's pinned programs (default window: last 7 days). */
export async function pinnedProgramStats(programIds: number[], days = 7): Promise<ProgramStat[]> {
  const out: ProgramStat[] = [];
  for (const id of programIds.slice(0, MAX_PINNED_PROGRAMS)) {
    const s = await statFor(id, days);
    if (s) out.push(s);
  }
  return out;
}

/** Programs a staff member can pin (most recent first) for the picker. */
export async function pinnablePrograms(limit = 40): Promise<Array<{ id: number; name: string }>> {
  const { data } = await supabaseAdmin()
    .from('programs')
    .select('id, name')
    .order('id', { ascending: false })
    .limit(limit);
  return data ?? [];
}
