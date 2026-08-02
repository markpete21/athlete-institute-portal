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
 *   division.show_full_names = true   -> "Ava Peterson"   (leagues + clinics default)
 *   division.show_full_names = false  -> "Ava P."         (tournaments + rep default)
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

export interface RosterEntry { teamId: number; teamName: string; displayName: string }

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
    .select('id, name, sport, show_full_names, program_id, programs(name, brand_key, tournament_mode)')
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
    .select('id, name, sport, show_full_names, show_on_compete, program_id, programs(name, brand_key, tournament_mode)')
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
    .select('team_id, teams(name), registrations(family_members(first_name, last_name, hide_from_public_rosters))')
    .eq('division_id', divisionId);
  const rosters: RosterEntry[] = (members ?? []).map((m) => {
    const team = m.teams as unknown as { name: string } | null;
    const fm = (m.registrations as unknown as { family_members: { first_name: string; last_name: string; hide_from_public_rosters: boolean } | null } | null)?.family_members ?? null;
    return {
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
    },
    standings,
    games,
    rosters,
  };
}
