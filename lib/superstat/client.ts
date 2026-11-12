import 'server-only';
import type { SsBoxScore, SsClub, SsEvents, SsInsights, SsMatch, SsRosterPlayer, SsTeam } from './types';

/**
 * Superstat API v1 client (https://docs.superstatsport.com/docs). Read-only
 * apart from generating insights. One club-scoped key, kept on the server
 * (SUPERSTAT_API_KEY, "ss_live_…"); never sent to the browser. Every
 * response is an envelope { data, error } with exactly one set.
 */
const BASE = process.env.SUPERSTAT_API_BASE ?? 'https://api.superstatsport.com/v1';

export class SuperstatError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = 'SuperstatError'; }
}

export const superstatConfigured = () => !!process.env.SUPERSTAT_API_KEY;

async function call<T>(path: string, init?: { method?: 'GET' | 'POST' }): Promise<T> {
  const key = process.env.SUPERSTAT_API_KEY;
  if (!key) throw new SuperstatError(0, 'NOT_CONFIGURED', 'Superstat is not connected (SUPERSTAT_API_KEY is not set).');
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { method: init?.method ?? 'GET', headers: { authorization: `Bearer ${key}`, accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    throw new SuperstatError(0, 'NETWORK', e instanceof Error ? e.message : 'Superstat could not be reached.');
  }
  let body: { data?: T | null; error?: { code?: string; message?: string } | null } | null = null;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok || !body || body.error || body.data == null) {
    throw new SuperstatError(res.status, body?.error?.code ?? 'HTTP_ERROR', body?.error?.message ?? `Superstat answered ${res.status}.`);
  }
  return body.data;
}

const id = (v: string) => encodeURIComponent(v);

export const listClubs = () => call<SsClub[]>('/clubs');
export const listClubTeams = (clubId: string) => call<SsTeam[]>(`/clubs/${id(clubId)}/teams`);
export const listTeamRoster = (teamId: string) => call<SsRosterPlayer[]>(`/teams/${id(teamId)}/roster`);
export const listTeamMatches = (teamId: string) => call<SsMatch[]>(`/teams/${id(teamId)}/matches`);
export const getMatch = (matchId: string) => call<SsMatch>(`/matches/${id(matchId)}`);
export const getBoxScore = (matchId: string) => call<SsBoxScore>(`/matches/${id(matchId)}/box-score`);
export const listEvents = (matchId: string) => call<SsEvents>(`/matches/${id(matchId)}/events`);
export const getMatchInsights = (matchId: string) => call<SsInsights>(`/matches/${id(matchId)}/insights`);
/** Starts a run (returns straight away with status "generating"); read it back on a later sync. */
export const generateMatchInsights = (matchId: string) => call<SsInsights>(`/matches/${id(matchId)}/insights`, { method: 'POST' });

/** The club's teams, or null when not connected / unreachable (for editor screens). */
export async function clubTeamsOrNull(): Promise<{ club: SsClub; teams: SsTeam[] } | { error: string } | null> {
  if (!superstatConfigured()) return null;
  try {
    const club = (await listClubs())[0];
    if (!club) return { error: 'The key works, but no club came back.' };
    return { club, teams: await listClubTeams(club.id) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Superstat could not be reached.' };
  }
}
