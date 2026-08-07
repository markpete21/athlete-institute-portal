import 'server-only';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { divisionStandings } from '@/lib/competitive/competitive';

/**
 * Compete. Portal data layer — the PUBLIC competitive site. Every read here is
 * anonymous: no session, no household context. It therefore returns ONLY what
 * is safe to publish, and the name rule is enforced in ONE place (displayName)
 * so a future page can't accidentally leak an unmasked minor's name.
 *
 * Name rule (Mark's spec):
 *   division.show_full_names = true   -> "Ava Peterson"   (tournaments + rep default)
 *   division.show_full_names = false  -> "Ava P."         (leagues + clinics default)
 *   family_members.hide_from_public_rosters -> "Team member" (always wins)
 *
 * Visibility: division.show_on_compete must be true. Academy divisions are
 * forced off at creation and by migration 0044.
 */

export interface CompeteDivision {
  id: number;
  name: string;
  sport: string;
  programId: number | null;
  programName: string | null;
  brandKey: string | null;
  teamCount: number;
  showFullNames: boolean;
  /** championship | showcase when the program is a tournament; null otherwise */
  tournamentMode: string | null;
  /** stats platform is per-division and default OFF */
  statsEnabled: boolean;
  statsShow: { averages: boolean; leaders: boolean; team: boolean };
}

export interface CompeteTeam { id: number; name: string }

export interface CompeteGame {
  id: number;
  startsAt: string | null;
  round: number | null;
  stage: 'regular' | 'playoff';
  status: string;
  homeTeamId: number | null;
  awayTeamId: number | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  overtime: boolean;
  liveStreamRef: string | null;
}

export interface RosterEntry { memberId: number; teamId: number; teamName: string; displayName: string }

/** Averages for one rostered player. memberId is team_members.id — an opaque
 *  public key; the underlying person stays behind the registration join. */
export interface PlayerAverages {
  memberId: number;
  name: string;
  teamId: number | null;
  teamName: string;
  gp: number;
  ppg: number;
  rpg: number;
  apg: number;
}

export interface DivisionStats {
  show: { averages: boolean; leaders: boolean; team: boolean };
  players: PlayerAverages[]; // ppg desc
  leaders: { key: 'ppg' | 'rpg' | 'apg'; label: string; top: PlayerAverages[] }[];
  leaderMinGp: number;
}

export interface PlayerGameLine {
  gameId: number;
  startsAt: string | null;
  opponent: string;
  result: string; // "W 68-61" from the player's side
  overtime: boolean;
  pts: number;
  reb: number;
  ast: number;
}

export interface PlayerProfile {
  memberId: number;
  name: string;
  teamName: string;
  gp: number;
  ppg: number;
  rpg: number;
  apg: number;
  log: PlayerGameLine[];
}

/** One row of the upcoming-games banner shown on every Compete page. */
export interface UpcomingGame {
  id: number;
  startsAt: string;
  divisionId: number;
  divisionName: string;
  programName: string | null;
  brandKey: string | null;
  homeTeam: string;
  awayTeam: string;
  facilityName: string | null;
  liveStreamRef: string | null;
}

/** A program tab in the top nav, with its published divisions. */
export interface CompeteProgram {
  programId: number;
  programName: string;
  brandKey: string | null;
  divisions: { id: number; name: string; sport: string }[];
}

/**
 * The one place a person's public name is computed. Everything on Compete that
 * shows a person MUST route through here.
 */
export function displayName(
  first: string | null,
  last: string | null,
  opts: { showFullNames: boolean; hidden: boolean },
): string {
  if (opts.hidden) return 'Team member';
  const f = (first ?? '').trim();
  const l = (last ?? '').trim();
  if (!f && !l) return 'Team member';
  if (opts.showFullNames) return [f, l].filter(Boolean).join(' ');
  return l ? `${f} ${l[0].toUpperCase()}.` : f;
}

/** Publicly visible divisions, newest first. */
export async function listDivisions(): Promise<CompeteDivision[]> {
  const db = supabaseAdmin();
  const { data } = await db
    .from('divisions')
    .select('id, name, sport, show_full_names, stats_enabled, stats_show, program_id, programs(name, brand_key, tournament_mode)')
    .eq('show_on_compete', true)
    .order('id', { ascending: false });
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: teams } = await db.from('teams').select('id, division_id').in('division_id', rows.map((r) => r.id));
  const counts = new Map<number, number>();
  for (const t of teams ?? []) counts.set(t.division_id, (counts.get(t.division_id) ?? 0) + 1);

  return rows.map((r) => {
    const p = r.programs as unknown as { name: string; brand_key: string | null; tournament_mode: string | null } | null;
    return {
      id: r.id,
      name: r.name,
      sport: r.sport,
      programId: r.program_id ?? null,
      programName: p?.name ?? null,
      brandKey: p?.brand_key ?? null,
      teamCount: counts.get(r.id) ?? 0,
      showFullNames: !!r.show_full_names,
      tournamentMode: p?.tournament_mode ?? null,
      statsEnabled: !!r.stats_enabled,
      statsShow: normalizeStatsShow(r.stats_show),
    };
  });
}

/** Published divisions grouped by program — the Compete top nav. */
export async function listPrograms(): Promise<CompeteProgram[]> {
  const byProgram = new Map<number, CompeteProgram>();
  const db = supabaseAdmin();
  const { data } = await db
    .from('divisions')
    .select('id, name, sport, program_id, programs(name, brand_key)')
    .eq('show_on_compete', true)
    .order('id');
  for (const d of data ?? []) {
    const p = d.programs as unknown as { name: string; brand_key: string | null } | null;
    const entry: CompeteProgram = byProgram.get(d.program_id) ?? { programId: d.program_id, programName: p?.name ?? 'Program', brandKey: p?.brand_key ?? null, divisions: [] };
    entry.divisions.push({ id: d.id, name: d.name, sport: d.sport });
    byProgram.set(d.program_id, entry);
  }
  return [...byProgram.values()];
}

/**
 * Next games across every published division — the banner strip. Facility
 * comes through the Module 2 booking when the game has one; the stream ref
 * feeds the Watch-live handoff. Nothing person-level is ever in here.
 */
export async function upcomingGames(limit = 12): Promise<UpcomingGame[]> {
  const db = supabaseAdmin();
  const { data: divs } = await db
    .from('divisions')
    .select('id, name, programs(name, brand_key)')
    .eq('show_on_compete', true);
  if (!divs?.length) return [];
  const divById = new Map(divs.map((d) => [d.id, d]));

  const { data: games } = await db
    .from('games')
    .select('id, division_id, starts_at, home_team_id, away_team_id, live_stream_ref, bookings(facilities(name))')
    .in('division_id', divs.map((d) => d.id))
    .eq('status', 'scheduled')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at')
    .limit(limit);
  if (!games?.length) return [];

  const teamIds = [...new Set(games.flatMap((g) => [g.home_team_id, g.away_team_id]).filter(Boolean))] as number[];
  const { data: teams } = await db.from('teams').select('id, name').in('id', teamIds);
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));

  return games.map((g) => {
    const d = divById.get(g.division_id)!;
    const p = d.programs as unknown as { name: string; brand_key: string | null } | null;
    const facility = (g.bookings as unknown as { facilities: { name: string } | null } | null)?.facilities?.name ?? null;
    return {
      id: g.id,
      startsAt: g.starts_at!,
      divisionId: g.division_id,
      divisionName: d.name,
      programName: p?.name ?? null,
      brandKey: p?.brand_key ?? null,
      homeTeam: g.home_team_id ? teamName.get(g.home_team_id) ?? 'TBD' : 'TBD',
      awayTeam: g.away_team_id ? teamName.get(g.away_team_id) ?? 'TBD' : 'TBD',
      facilityName: facility,
      liveStreamRef: g.live_stream_ref,
    };
  });
}

/** One division's public page: standings, games, rosters. Null if not published. */
export async function divisionDetail(divisionId: number): Promise<{
  division: CompeteDivision;
  standings: Awaited<ReturnType<typeof divisionStandings>>;
  games: CompeteGame[];
  rosters: RosterEntry[];
} | null> {
  const db = supabaseAdmin();
  const { data: div } = await db
    .from('divisions')
    .select('id, name, sport, show_full_names, show_on_compete, stats_enabled, stats_show, program_id, programs(name, brand_key, tournament_mode)')
    .eq('id', divisionId)
    .maybeSingle();
  // A division that isn't published is a 404 to the public, not a 403 — we don't
  // confirm that a hidden division exists.
  if (!div || !div.show_on_compete) return null;

  const p = div.programs as unknown as { name: string; brand_key: string | null; tournament_mode: string | null } | null;
  const standings = await divisionStandings(divisionId);
  const teamName = (id: number | null) => (id ? standings.teamNames.get(id) ?? 'TBD' : 'TBD');

  const { data: gameRows } = await db
    .from('games')
    .select('id, starts_at, round, stage, status, home_team_id, away_team_id, home_score, away_score, overtime, live_stream_ref')
    .eq('division_id', divisionId)
    .order('starts_at', { nullsFirst: false });
  const games: CompeteGame[] = (gameRows ?? []).map((g) => ({
    id: g.id,
    startsAt: g.starts_at,
    round: g.round,
    stage: (g.stage ?? 'regular') as 'regular' | 'playoff',
    status: g.status,
    homeTeamId: g.home_team_id,
    awayTeamId: g.away_team_id,
    homeTeam: teamName(g.home_team_id),
    awayTeam: teamName(g.away_team_id),
    homeScore: g.home_score,
    awayScore: g.away_score,
    overtime: !!g.overtime,
    liveStreamRef: g.live_stream_ref,
  }));

  // Rosters: join through the registration to the family member, then mask.
  const showFullNames = !!div.show_full_names;
  const { data: members } = await db
    .from('team_members')
    .select('id, team_id, teams(name), registrations(family_members(first_name, last_name, hide_from_public_rosters))')
    .eq('division_id', divisionId);
  const rosters: RosterEntry[] = (members ?? []).map((m) => {
    const team = m.teams as unknown as { name: string } | null;
    const fm = (m.registrations as unknown as { family_members: { first_name: string; last_name: string; hide_from_public_rosters: boolean } | null } | null)?.family_members ?? null;
    return {
      memberId: m.id,
      teamId: m.team_id,
      teamName: team?.name ?? 'Unassigned',
      displayName: displayName(fm?.first_name ?? null, fm?.last_name ?? null, {
        showFullNames,
        hidden: !!fm?.hide_from_public_rosters,
      }),
    };
  });

  return {
    division: {
      id: div.id, name: div.name, sport: div.sport, programId: div.program_id ?? null, programName: p?.name ?? null,
      brandKey: p?.brand_key ?? null, teamCount: standings.teamNames.size, showFullNames,
      tournamentMode: p?.tournament_mode ?? null,
      statsEnabled: !!div.stats_enabled,
      statsShow: normalizeStatsShow(div.stats_show),
    },
    standings,
    games,
    rosters,
  };
}

/* ------------------------------------------------------------------ */
/* Stats platform (migration 0054) — per-division, default OFF.       */
/* ------------------------------------------------------------------ */

export function normalizeStatsShow(raw: unknown): { averages: boolean; leaders: boolean; team: boolean } {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    averages: o.averages !== false,
    leaders: o.leaders !== false,
    team: o.team !== false,
  };
}

const LEADER_MIN_GP = 3;
const r1 = (n: number) => Math.round(n * 10) / 10;

interface StatLineRow {
  team_member_id: number;
  team_id: number | null;
  pts: number;
  reb: number;
  ast: number;
  game_id: number;
}

/** Masked player names + team for a set of team_member ids. */
async function memberNames(divisionId: number, showFullNames: boolean) {
  const db = supabaseAdmin();
  const { data: members } = await db
    .from('team_members')
    .select('id, team_id, teams(name), registrations(family_members(first_name, last_name, hide_from_public_rosters))')
    .eq('division_id', divisionId);
  const map = new Map<number, { name: string; teamId: number | null; teamName: string }>();
  for (const m of members ?? []) {
    const team = m.teams as unknown as { name: string } | null;
    const fm = (m.registrations as unknown as { family_members: { first_name: string; last_name: string; hide_from_public_rosters: boolean } | null } | null)?.family_members ?? null;
    map.set(m.id, {
      name: displayName(fm?.first_name ?? null, fm?.last_name ?? null, {
        showFullNames,
        hidden: !!fm?.hide_from_public_rosters,
      }),
      teamId: m.team_id,
      teamName: team?.name ?? 'Unassigned',
    });
  }
  return map;
}

/**
 * Player averages + leader boards for a division. Null when the division
 * isn't published or its stats platform is off — the public page treats
 * both identically (no Stats tab at all).
 */
export async function divisionStats(divisionId: number): Promise<DivisionStats | null> {
  const db = supabaseAdmin();
  const { data: div } = await db
    .from('divisions')
    .select('id, show_on_compete, show_full_names, stats_enabled, stats_show')
    .eq('id', divisionId)
    .maybeSingle();
  if (!div || !div.show_on_compete || !div.stats_enabled) return null;

  const { data: lines } = await db
    .from('game_stat_lines')
    .select('team_member_id, team_id, pts, reb, ast, game_id, games!inner(status)')
    .eq('division_id', divisionId)
    .eq('games.status', 'final');

  const names = await memberNames(divisionId, !!div.show_full_names);
  const agg = new Map<number, { gp: number; pts: number; reb: number; ast: number; teamId: number | null }>();
  for (const l of (lines ?? []) as unknown as StatLineRow[]) {
    const a = agg.get(l.team_member_id) ?? { gp: 0, pts: 0, reb: 0, ast: 0, teamId: l.team_id };
    a.gp += 1; a.pts += l.pts; a.reb += l.reb; a.ast += l.ast;
    if (l.team_id != null) a.teamId = l.team_id;
    agg.set(l.team_member_id, a);
  }

  const players: PlayerAverages[] = [...agg.entries()].map(([memberId, a]) => {
    const who = names.get(memberId);
    return {
      memberId,
      name: who?.name ?? 'Team member',
      teamId: who?.teamId ?? a.teamId,
      teamName: who?.teamName ?? 'Unassigned',
      gp: a.gp,
      ppg: r1(a.pts / a.gp),
      rpg: r1(a.reb / a.gp),
      apg: r1(a.ast / a.gp),
    };
  }).sort((x, y) => y.ppg - x.ppg);

  // Leaders need LEADER_MIN_GP; early in a season nobody qualifies, so fall
  // back to 1 GP rather than render empty boards.
  const minGp = players.some((p) => p.gp >= LEADER_MIN_GP) ? LEADER_MIN_GP : 1;
  const qualified = players.filter((p) => p.gp >= minGp);
  const top = (key: 'ppg' | 'rpg' | 'apg') => [...qualified].sort((x, y) => y[key] - x[key]).slice(0, 5);

  return {
    show: normalizeStatsShow(div.stats_show),
    players,
    leaders: [
      { key: 'ppg', label: 'Points per game', top: top('ppg') },
      { key: 'rpg', label: 'Rebounds per game', top: top('rpg') },
      { key: 'apg', label: 'Assists per game', top: top('apg') },
    ],
    leaderMinGp: minGp,
  };
}

/** One player's public profile: averages + game-by-game log. Same gates as
 *  divisionStats — a profile can never show more than the page that links it. */
export async function playerProfile(divisionId: number, memberId: number): Promise<PlayerProfile | null> {
  const db = supabaseAdmin();
  const { data: div } = await db
    .from('divisions')
    .select('id, show_on_compete, show_full_names, stats_enabled')
    .eq('id', divisionId)
    .maybeSingle();
  if (!div || !div.show_on_compete || !div.stats_enabled) return null;

  const names = await memberNames(divisionId, !!div.show_full_names);
  const who = names.get(memberId);
  if (!who) return null;

  const { data: teams } = await db.from('teams').select('id, name').eq('division_id', divisionId);
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));

  const { data: lines } = await db
    .from('game_stat_lines')
    .select('team_member_id, team_id, pts, reb, ast, game_id, games!inner(status, starts_at, home_team_id, away_team_id, home_score, away_score, overtime)')
    .eq('division_id', divisionId)
    .eq('team_member_id', memberId)
    .eq('games.status', 'final');

  const log: PlayerGameLine[] = (lines ?? []).map((l) => {
    const g = l.games as unknown as {
      status: string; starts_at: string | null;
      home_team_id: number | null; away_team_id: number | null;
      home_score: number | null; away_score: number | null; overtime: boolean;
    };
    const myTeam = l.team_id ?? who.teamId;
    const isHome = g.home_team_id != null && g.home_team_id === myTeam;
    const oppId = isHome ? g.away_team_id : g.home_team_id;
    const my = isHome ? g.home_score : g.away_score;
    const their = isHome ? g.away_score : g.home_score;
    const outcome = my == null || their == null ? '' : my > their ? 'W' : my < their ? 'L' : 'T';
    return {
      gameId: l.game_id,
      startsAt: g.starts_at,
      opponent: oppId ? teamName.get(oppId) ?? 'TBD' : 'TBD',
      result: outcome ? `${outcome} ${my}-${their}` : 'Final',
      overtime: !!g.overtime,
      pts: l.pts, reb: l.reb, ast: l.ast,
    };
  }).sort((a, b) => (b.startsAt ?? '').localeCompare(a.startsAt ?? ''));

  const gp = log.length;
  const sum = (k: 'pts' | 'reb' | 'ast') => log.reduce((n, l) => n + l[k], 0);
  return {
    memberId,
    name: who.name,
    teamName: who.teamName,
    gp,
    ppg: gp ? r1(sum('pts') / gp) : 0,
    rpg: gp ? r1(sum('reb') / gp) : 0,
    apg: gp ? r1(sum('ast') / gp) : 0,
    log,
  };
}
