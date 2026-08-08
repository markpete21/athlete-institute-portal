import 'server-only';
import { audit, torontoDate, torontoTimeOfDay } from '@ai/foundation';
import { notify } from '@ai/foundation/notify';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Officials (referees): a small pool with a daily availability window and cap,
 * auto-assigned to a division's scheduled games under hard rules:
 *   - inside their availability window
 *   - never two games at overlapping times
 *   - never over their per-day cap
 *   - never a game whose team they coach (via the optional staff link)
 * Assignment is scarcest-game-first within each date so an easy game never
 * starves a constrained one, then spread by season totals so pay lands evenly.
 * A game the rules can't fill is reported, never silently short-staffed.
 */

export interface OfficialRow {
  id: number;
  staffId: number | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  availStart: string | null; // 'HH:MM'
  availEnd: string | null;
  maxPerDay: number;
  payCents: number;
  active: boolean;
  notes: string | null;
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

export async function listOfficials(includeInactive = false): Promise<OfficialRow[]> {
  const db = supabaseAdmin();
  let q = db.from('officials').select('id, staff_id, first_name, last_name, email, phone, avail_start, avail_end, max_per_day, pay_cents, active, notes').order('last_name');
  if (!includeInactive) q = q.eq('active', true);
  const { data } = await q;
  return (data ?? []).map((o) => ({
    id: o.id, staffId: o.staff_id, firstName: o.first_name, lastName: o.last_name,
    email: o.email, phone: o.phone, availStart: hhmm(o.avail_start), availEnd: hhmm(o.avail_end),
    maxPerDay: o.max_per_day, payCents: o.pay_cents, active: o.active, notes: o.notes,
  }));
}

export async function upsertOfficial(input: { id?: number | null; firstName: string; lastName: string; email?: string | null; phone?: string | null; availStart?: string | null; availEnd?: string | null; maxPerDay?: number; payCents?: number; staffId?: number | null; notes?: string | null; active?: boolean }, actorClerkId: string): Promise<number> {
  const db = supabaseAdmin();
  const row = {
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    avail_start: input.availStart || null,
    avail_end: input.availEnd || null,
    max_per_day: input.maxPerDay ?? 4,
    pay_cents: input.payCents ?? 3500,
    staff_id: input.staffId ?? null,
    notes: input.notes?.trim() || null,
    active: input.active ?? true,
  };
  if (!row.first_name || !row.last_name) throw new Error('Official needs a first and last name.');
  if (input.id) {
    const { error } = await db.from('officials').update(row).eq('id', input.id);
    if (error) throw new Error(error.message);
    await audit({ actorId: actorClerkId, action: 'official.updated', target: `official:${input.id}` });
    return input.id;
  }
  const { data, error } = await db.from('officials').insert({ ...row, created_by: actorClerkId }).select('id').single();
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'official.created', target: `official:${data.id}`, meta: { name: `${row.first_name} ${row.last_name}` } });
  return data.id;
}

interface GameLite {
  id: number;
  starts_at: string;
  ends_at: string | null;
  home_team_id: number | null;
  away_team_id: number | null;
}

export interface AssignReport {
  needed: number;
  filled: number;
  unfilled: { gameId: number; label: string; got: number }[];
  totals: Record<number, number>; // officialId -> games
  payTotalCents: number;
}

/** Auto-assign the pool to every scheduled game in the division (replaces prior assignments). */
export async function assignOfficials(input: { divisionId: number; perGame: number; actorClerkId: string }): Promise<AssignReport> {
  const db = supabaseAdmin();
  const perGame = Math.max(1, Math.min(3, input.perGame));
  const [{ data: games }, { data: teams }, pool] = await Promise.all([
    db.from('games').select('id, starts_at, ends_at, home_team_id, away_team_id').eq('division_id', input.divisionId).not('starts_at', 'is', null).order('starts_at'),
    db.from('teams').select('id, name, coach_staff_id').eq('division_id', input.divisionId),
    listOfficials(),
  ]);
  if (!games?.length) throw new Error('No scheduled games to assign - build the schedule first.');
  if (!pool.length) throw new Error('No active officials in the pool - add them under Competitive > Officials.');
  const coachOf = new Map((teams ?? []).map((t) => [t.id, t.coach_staff_id as number | null]));
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name as string]));

  await db.from('game_officials').delete().in('game_id', games.map((g) => g.id));

  const totals: Record<number, number> = Object.fromEntries(pool.map((o) => [o.id, 0]));
  const unfilled: AssignReport['unfilled'] = [];
  let filled = 0;

  // Group by Toronto date so daily caps + overlap windows reset each game day.
  const byDate = new Map<string, GameLite[]>();
  for (const g of games as GameLite[]) {
    const key = torontoDate(g.starts_at);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(g);
  }

  const overlaps = (a: GameLite, b: GameLite) => {
    const aStart = Date.parse(a.starts_at); const aEnd = a.ends_at ? Date.parse(a.ends_at) : aStart + 3600_000;
    const bStart = Date.parse(b.starts_at); const bEnd = b.ends_at ? Date.parse(b.ends_at) : bStart + 3600_000;
    return aStart < bEnd && bStart < aEnd;
  };

  const inserts: { game_id: number; official_id: number; created_by: string }[] = [];
  for (const dayGames of byDate.values()) {
    const dayCount: Record<number, number> = Object.fromEntries(pool.map((o) => [o.id, 0]));
    const assignedGamesFor = new Map<number, GameLite[]>(pool.map((o) => [o.id, []]));

    const candidatesFor = (g: GameLite) => pool.filter((o) => {
      const tip = torontoTimeOfDay(g.starts_at);
      const end = g.ends_at ? torontoTimeOfDay(g.ends_at) : tip;
      if (o.availStart && tip < o.availStart) return false;
      if (o.availEnd && end > o.availEnd) return false;
      if (dayCount[o.id] >= o.maxPerDay) return false;
      if (assignedGamesFor.get(o.id)!.some((other) => overlaps(g, other))) return false;
      if (o.staffId != null && (coachOf.get(g.home_team_id ?? -1) === o.staffId || coachOf.get(g.away_team_id ?? -1) === o.staffId)) return false;
      return true;
    });

    // Staff the scarcest game first so an easy game never starves a constrained one.
    const order = dayGames
      .map((g) => ({ g, n: candidatesFor(g).length }))
      .sort((a, b) => a.n - b.n)
      .map((x) => x.g);

    for (const g of order) {
      const take = candidatesFor(g)
        .sort((a, b) => totals[a.id] - totals[b.id] || dayCount[a.id] - dayCount[b.id] || a.id - b.id)
        .slice(0, perGame);
      for (const o of take) {
        inserts.push({ game_id: g.id, official_id: o.id, created_by: input.actorClerkId });
        totals[o.id]++; dayCount[o.id]++; assignedGamesFor.get(o.id)!.push(g);
      }
      filled += take.length;
      if (take.length < perGame) {
        unfilled.push({
          gameId: g.id,
          label: `${torontoDate(g.starts_at)} ${torontoTimeOfDay(g.starts_at)} ${teamName.get(g.home_team_id ?? -1) ?? '?'} vs ${teamName.get(g.away_team_id ?? -1) ?? '?'}`,
          got: take.length,
        });
      }
    }
  }
  if (inserts.length) {
    const { error } = await db.from('game_officials').insert(inserts);
    if (error) throw new Error(error.message);
  }
  const payTotalCents = pool.reduce((n, o) => n + totals[o.id] * o.payCents, 0);
  const report: AssignReport = { needed: games.length * perGame, filled, unfilled, totals, payTotalCents };
  await audit({ actorId: input.actorClerkId, action: 'division.officials-assigned', target: `division:${input.divisionId}`, meta: { perGame, needed: report.needed, filled, unfilled: unfilled.length } });
  return report;
}

export interface OfficialScheduleLine {
  gameId: number;
  dateLabel: string; // 'Sat Sep 12'
  timeLabel: string; // '9:00 AM'
  facility: string;
  matchup: string;
}

export interface OfficialSchedule {
  official: OfficialRow;
  lines: OfficialScheduleLine[];
  payCents: number;
}

const DATE_LABEL = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', weekday: 'short', month: 'short', day: 'numeric' });
const TIME_LABEL = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' });

/** Per-official condensed schedules (only officials with at least one game). */
export async function officialSchedules(divisionId: number): Promise<{ schedules: OfficialSchedule[]; assignmentsByGame: Map<number, string[]> }> {
  const db = supabaseAdmin();
  const [{ data: games }, { data: teams }, pool] = await Promise.all([
    db.from('games').select('id, starts_at, home_team_id, away_team_id, bookings(facilities(name))').eq('division_id', divisionId).not('starts_at', 'is', null).order('starts_at'),
    db.from('teams').select('id, name').eq('division_id', divisionId),
    listOfficials(true),
  ]);
  const gameIds = (games ?? []).map((g) => g.id);
  const { data: assigns } = gameIds.length
    ? await db.from('game_officials').select('game_id, official_id').in('game_id', gameIds)
    : { data: [] as { game_id: number; official_id: number }[] };
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const byOfficial = new Map<number, number[]>();
  const assignmentsByGame = new Map<number, string[]>();
  const officialById = new Map(pool.map((o) => [o.id, o]));
  for (const a of assigns ?? []) {
    if (!byOfficial.has(a.official_id)) byOfficial.set(a.official_id, []);
    byOfficial.get(a.official_id)!.push(a.game_id);
    const o = officialById.get(a.official_id);
    if (o) {
      if (!assignmentsByGame.has(a.game_id)) assignmentsByGame.set(a.game_id, []);
      assignmentsByGame.get(a.game_id)!.push(`${o.firstName.charAt(0)}. ${o.lastName}`);
    }
  }
  const gameById = new Map((games ?? []).map((g) => [g.id, g]));
  const schedules: OfficialSchedule[] = [];
  for (const [officialId, ids] of byOfficial) {
    const o = officialById.get(officialId);
    if (!o) continue;
    const lines = ids
      .map((id) => gameById.get(id))
      .filter(Boolean)
      .sort((a, b) => String(a!.starts_at).localeCompare(String(b!.starts_at)))
      .map((g) => ({
        gameId: g!.id,
        dateLabel: DATE_LABEL.format(new Date(g!.starts_at)),
        timeLabel: TIME_LABEL.format(new Date(g!.starts_at)),
        facility: ((g!.bookings as unknown as { facilities: { name: string } | null } | null)?.facilities?.name) ?? 'TBD',
        matchup: `${teamName.get(g!.home_team_id!) ?? '?'} vs ${teamName.get(g!.away_team_id!) ?? '?'}`,
      }));
    schedules.push({ official: o, lines, payCents: lines.length * o.payCents });
  }
  schedules.sort((a, b) => a.official.lastName.localeCompare(b.official.lastName));
  return { schedules, assignmentsByGame };
}

/** Email each assigned official their own condensed schedule (their games only). */
export async function emailOfficialSchedules(divisionId: number, actorClerkId: string): Promise<{ emailed: number; noEmail: string[] }> {
  const db = supabaseAdmin();
  const { data: div } = await db.from('divisions').select('name, programs(name)').eq('id', divisionId).single();
  const programName = (div?.programs as unknown as { name: string } | null)?.name ?? '';
  const { schedules } = await officialSchedules(divisionId);
  let emailed = 0; const noEmail: string[] = [];
  for (const s of schedules) {
    if (!s.lines.length) continue;
    if (!s.official.email) { noEmail.push(`${s.official.firstName} ${s.official.lastName}`); continue; }
    const body = [
      `Your officiating schedule for ${programName} - ${div?.name ?? ''} (${s.lines.length} game${s.lines.length === 1 ? '' : 's'}):`,
      '',
      ...s.lines.map((l) => `${l.dateLabel} - ${l.timeLabel} - ${l.facility} - ${l.matchup}`),
      '',
      `Game fee: $${(s.official.payCents / 100).toFixed(2)} per game.`,
    ].join('\n');
    await notify({
      to: { email: s.official.email },
      channels: ['email'],
      template: 'generic',
      data: { heading: 'Your officiating schedule', body },
    });
    emailed++;
  }
  await audit({ actorId: actorClerkId, action: 'division.officials-schedules-sent', target: `division:${divisionId}`, meta: { emailed, noEmail: noEmail.length } });
  return { emailed, noEmail };
}
