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
  programName: string | null;
  brandKey: string | null;
  teamCount: number;
  showFullNames: boolean;
}

export interface CompeteTeam { id: number; name: string }

export interface CompeteGame {
  id: number;
  startsAt: string | null;
  round: number | null;
  status: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  overtime: boolean;
  liveStreamRef: string | null;
}

export interface RosterEntry { teamId: number; teamName: string; displayName: string }

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
    .select('id, name, sport, show_full_names, program_id, programs(name, brand_key)')
    .eq('show_on_compete', true)
    .order('id', { ascending: false });
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: teams } = await db.from('teams').select('id, division_id').in('division_id', rows.map((r) => r.id));
  const counts = new Map<number, number>();
  for (const t of teams ?? []) counts.set(t.division_id, (counts.get(t.division_id) ?? 0) + 1);

  return rows.map((r) => {
    const p = r.programs as unknown as { name: string; brand_key: string | null } | null;
    return {
      id: r.id,
      name: r.name,
      sport: r.sport,
      programName: p?.name ?? null,
      brandKey: p?.brand_key ?? null,
      teamCount: counts.get(r.id) ?? 0,
      showFullNames: !!r.show_full_names,
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
    .select('id, name, sport, show_full_names, show_on_compete, program_id, programs(name, brand_key)')
    .eq('id', divisionId)
    .maybeSingle();
  // A division that isn't published is a 404 to the public, not a 403 — we don't
  // confirm that a hidden division exists.
  if (!div || !div.show_on_compete) return null;

  const p = div.programs as unknown as { name: string; brand_key: string | null } | null;
  const standings = await divisionStandings(divisionId);
  const teamName = (id: number | null) => (id ? standings.teamNames.get(id) ?? 'TBD' : 'TBD');

  const { data: gameRows } = await db
    .from('games')
    .select('id, starts_at, round, status, home_team_id, away_team_id, home_score, away_score, overtime, live_stream_ref')
    .eq('division_id', divisionId)
    .order('starts_at', { nullsFirst: false });
  const games: CompeteGame[] = (gameRows ?? []).map((g) => ({
    id: g.id,
    startsAt: g.starts_at,
    round: g.round,
    status: g.status,
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
      id: div.id, name: div.name, sport: div.sport, programName: p?.name ?? null,
      brandKey: p?.brand_key ?? null, teamCount: standings.teamNames.size, showFullNames,
    },
    standings,
    games,
    rosters,
  };
}
