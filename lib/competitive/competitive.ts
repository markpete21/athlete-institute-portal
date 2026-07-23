import 'server-only';
import {
  DEFAULT_TIEBREAKS,
  assignSlots,
  audit,
  balanceDraft,
  computeStandings,
  roundRobin,
  suggestReplacements,
  torontoInstant,
  type BalanceAttribute,
  type DraftPlayer,
  type GameResult,
  type Sport,
  type StandingRow,
} from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createBooking } from '@/lib/bookings';

/**
 * Competitive Play API (Module 6) - the engine Leagues/Camps/Tournaments plug
 * into. Wraps the pure @ai/foundation/competitive engine with persistence:
 * divisions/teams/rosters, team builder, replacement suggester, schedule
 * builder (publishes bookings via Module 2), score entry, standings.
 */

export async function createDivision(input: { programId: number; name: string; sport: Sport; maxTeams?: number | null; minPlayers?: number | null; maxPlayers?: number | null }, actorClerkId: string): Promise<number> {
  const { data, error } = await supabaseAdmin()
    .from('divisions')
    .insert({ program_id: input.programId, name: input.name.trim(), sport: input.sport, max_teams: input.maxTeams ?? null, min_players: input.minPlayers ?? null, max_players: input.maxPlayers ?? null, tiebreaks: DEFAULT_TIEBREAKS[input.sport] })
    .select('id')
    .single();
  if (error) throw new Error(`division create failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'division.created', target: `division:${data.id}`, meta: { name: input.name, sport: input.sport } });
  return data.id;
}

/** Roster row from a registration (before/after the draft). */
export async function addRosterMember(input: { divisionId: number; registrationId: number; lockedTeamId?: number | null; groupKey?: string | null }): Promise<void> {
  const { error } = await supabaseAdmin().from('team_members').insert({ division_id: input.divisionId, registration_id: input.registrationId, team_id: input.lockedTeamId ?? null, locked: !!input.lockedTeamId, group_key: input.groupKey ?? null });
  if (error) throw new Error(error.message);
}

/**
 * Run the balancing draft for a division: reads each roster member's attributes
 * from Module 4 custom-question answers, creates the teams, and assigns players.
 * `attributeQuestionMap` maps a balance attribute -> the question id to read.
 */
export async function runTeamBuilder(input: { divisionId: number; numTeams: number; attributes: BalanceAttribute[]; attributeQuestionMap?: Partial<Record<BalanceAttribute, number>>; actorClerkId: string }): Promise<{ teamIds: number[]; spread: Record<string, number> }> {
  const db = supabaseAdmin();
  const { data: members } = await db.from('team_members').select('id, registration_id, team_id, locked, group_key').eq('division_id', input.divisionId);
  if (!members?.length) throw new Error('No roster members to draft.');

  // Read attribute values from registration answers + jersey size.
  const regIds = members.map((m) => m.registration_id).filter(Boolean) as number[];
  const { data: regs } = await db.from('registrations').select('id, jersey_size').in('id', regIds);
  const jerseyByReg = new Map((regs ?? []).map((r) => [r.id, r.jersey_size as string | null]));
  const qIds = Object.values(input.attributeQuestionMap ?? {}).filter(Boolean) as number[];
  const answers = qIds.length ? (await db.from('question_answers').select('registration_id, question_id, answer').in('registration_id', regIds).in('question_id', qIds)).data ?? [] : [];
  const ansMap = new Map(answers.map((a) => [`${a.registration_id}:${a.question_id}`, a.answer]));

  // Create the teams first (so lockedTeam indices are stable 0..n-1).
  const teamIds: number[] = [];
  for (let i = 0; i < input.numTeams; i++) {
    const { data: t, error } = await db.from('teams').insert({ division_id: input.divisionId, name: `Team ${i + 1}`, sort_order: i }).select('id').single();
    if (error) throw new Error(error.message);
    teamIds.push(t.id);
  }
  const teamIndexById = new Map(teamIds.map((id, i) => [id, i]));

  const players: DraftPlayer[] = members.map((m) => {
    const num = (attr: BalanceAttribute) => { const qid = input.attributeQuestionMap?.[attr]; const v = qid ? ansMap.get(`${m.registration_id}:${qid}`) : undefined; return v != null ? Number(v) : undefined; };
    const genderQ = input.attributeQuestionMap?.gender;
    return {
      id: m.id,
      age: input.attributes.includes('age') ? num('age') : undefined,
      skill: input.attributes.includes('skill') ? num('skill') : undefined,
      experience: input.attributes.includes('experience') ? num('experience') : undefined,
      height: input.attributes.includes('height') ? num('height') : undefined,
      gender: input.attributes.includes('gender') && genderQ ? String(ansMap.get(`${m.registration_id}:${genderQ}`) ?? '') || undefined : undefined,
      jerseySize: jerseyByReg.get(m.registration_id ?? -1) ?? undefined,
      lockedTeam: m.locked && m.team_id ? teamIndexById.get(m.team_id) : undefined,
      groupKey: m.group_key ?? undefined,
    };
  });

  const result = balanceDraft(players, input.numTeams, input.attributes);
  // Persist assignments (team_members.id === DraftPlayer.id).
  for (let ti = 0; ti < result.teams.length; ti++) {
    for (const memberId of result.teams[ti]) {
      await db.from('team_members').update({ team_id: teamIds[ti] }).eq('id', memberId);
    }
  }
  await audit({ actorId: input.actorClerkId, action: 'division.drafted', target: `division:${input.divisionId}`, meta: { numTeams: input.numTeams, spread: result.spread } });
  return { teamIds, spread: result.spread as Record<string, number> };
}

/** Top-5 replacement candidates when a player drops (reverse balance). */
export async function replacementSuggestions(divisionId: number, droppedMemberId: number): Promise<ReturnType<typeof suggestReplacements>> {
  const db = supabaseAdmin();
  const { data: members } = await db.from('team_members').select('id, team_id, registration_id').eq('division_id', divisionId);
  const { data: teamsRows } = await db.from('teams').select('id').eq('division_id', divisionId).order('sort_order');
  const teamIds = (teamsRows ?? []).map((t) => t.id);
  const teamIndexById = new Map(teamIds.map((id, i) => [id, i]));
  const regIds = (members ?? []).map((m) => m.registration_id).filter(Boolean) as number[];
  const { data: regs } = await db.from('registrations').select('id, jersey_size').in('id', regIds);
  const jersey = new Map((regs ?? []).map((r) => [r.id, r.jersey_size as string | null]));

  const asPlayer = (m: { id: number; registration_id: number | null }): DraftPlayer => ({ id: m.id, jerseySize: jersey.get(m.registration_id ?? -1) ?? undefined });
  const dropped = (members ?? []).find((m) => m.id === droppedMemberId);
  if (!dropped) throw new Error('Dropped member not found.');
  const teams: DraftPlayer[][] = teamIds.map(() => []);
  for (const m of members ?? []) { if (m.team_id && m.id !== droppedMemberId) teams[teamIndexById.get(m.team_id)!]?.push(asPlayer(m)); }
  return suggestReplacements(asPlayer(dropped), teams, dropped.team_id ? teamIndexById.get(dropped.team_id)! : 0);
}

export interface ScheduleParams {
  divisionId: number;
  facilityId: number;
  startDate: string;       // YYYY-MM-DD
  weekdays: number[];      // 0-6
  timeSlots: string[];     // 'HH:MM' start times
  gameMinutes: number;
  numCourts: number;
  doubleRound?: boolean;
  actorClerkId: string;
}

/**
 * Build + publish a league schedule: round-robin, soft time-slot balancing,
 * one booking per game via Module 2 (double-bookings surface in the conflicts
 * queue), one game row per matchup. Returns the per-team slot distribution.
 */
export async function buildLeagueSchedule(params: ScheduleParams): Promise<{ gameCount: number; distribution: Record<number, Record<string, number>>; conflicts: number }> {
  const db = supabaseAdmin();
  const { data: teamsRows } = await db.from('teams').select('id, name').eq('division_id', params.divisionId).order('sort_order');
  const teamIds = (teamsRows ?? []).map((t) => t.id);
  if (teamIds.length < 2) throw new Error('Need at least 2 teams to schedule.');
  const { data: div } = await db.from('divisions').select('program_id, name').eq('id', params.divisionId).single();
  const { data: prog } = await db.from('programs').select('name').eq('id', div!.program_id).single();

  const rr = roundRobin(teamIds.length, params.doubleRound);
  const { games, distribution } = assignSlots(rr, params.timeSlots, params.numCourts);

  // Spread rounds across weekdays starting startDate: round r -> r-th matching weekday.
  const dates = upcomingDates(params.startDate, params.weekdays, Math.max(...games.map((g) => g.round)));
  let conflicts = 0;
  for (const g of games) {
    const date = dates[g.round - 1] ?? dates[dates.length - 1];
    const startsAt = torontoInstant(date, g.timeSlot);
    const [h, m] = g.timeSlot.split(':').map(Number);
    const endMin = h * 60 + m + params.gameMinutes;
    const endsAt = torontoInstant(date, `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`);
    const booking = await createBooking({ facilityId: params.facilityId, startsAt, endsAt, source: 'program', title: `${prog!.name}: ${teamsRows![g.home].name} vs ${teamsRows![g.away].name}`, sourceRef: `division:${params.divisionId}`, actorClerkId: params.actorClerkId });
    if (booking.conflicts.length) conflicts++;
    await db.from('games').insert({ division_id: params.divisionId, round: g.round, home_team_id: teamIds[g.home], away_team_id: teamIds[g.away], booking_id: booking.booking.id, starts_at: startsAt, ends_at: endsAt, court: g.court });
  }
  await audit({ actorId: params.actorClerkId, action: 'division.scheduled', target: `division:${params.divisionId}`, meta: { games: games.length, conflicts } });
  return { gameCount: games.length, distribution, conflicts };
}

/** Score entry (permission-gated at the action layer): save -> winner + final + Watch toggle. */
export async function saveScore(input: { gameId: number; homeScore: number; awayScore: number; overtime?: boolean; liveStreamRef?: string | null; actorClerkId: string }): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('games')
    .update({ home_score: input.homeScore, away_score: input.awayScore, overtime: input.overtime ?? false, status: 'final', live_stream_ref: input.liveStreamRef ?? null })
    .eq('id', input.gameId);
  if (error) throw new Error(`score save failed: ${error.message}`);
  await audit({ actorId: input.actorClerkId, action: 'game.scored', target: `game:${input.gameId}`, meta: { home: input.homeScore, away: input.awayScore, overtime: input.overtime } });
}

/** Sport-aware standings for a division from final games. */
export async function divisionStandings(divisionId: number): Promise<{ standings: StandingRow[]; teamNames: Map<number, string>; sport: Sport }> {
  const db = supabaseAdmin();
  const { data: div } = await db.from('divisions').select('sport, tiebreaks').eq('id', divisionId).single();
  const { data: teamsRows } = await db.from('teams').select('id, name').eq('division_id', divisionId).order('sort_order');
  const teamIds = (teamsRows ?? []).map((t) => t.id);
  const { data: games } = await db.from('games').select('home_team_id, away_team_id, home_score, away_score').eq('division_id', divisionId).eq('status', 'final');
  const results: GameResult[] = (games ?? []).filter((g) => g.home_team_id && g.away_team_id).map((g) => ({ homeTeam: g.home_team_id!, awayTeam: g.away_team_id!, homeScore: g.home_score ?? 0, awayScore: g.away_score ?? 0 }));
  const tiebreaks = (div!.tiebreaks as string[])?.length ? (div!.tiebreaks as string[]) : DEFAULT_TIEBREAKS[div!.sport as Sport];
  return { standings: computeStandings(results, teamIds, tiebreaks), teamNames: new Map((teamsRows ?? []).map((t) => [t.id, t.name])), sport: div!.sport as Sport };
}

function upcomingDates(startISO: string, weekdays: number[], count: number): string[] {
  const [y, m, d] = startISO.split('-').map(Number);
  const out: string[] = [];
  let cur = new Date(Date.UTC(y, m - 1, d));
  const wanted = new Set(weekdays);
  while (out.length < count) {
    if (wanted.has(cur.getUTCDay())) out.push(cur.toISOString().slice(0, 10));
    cur = new Date(cur.getTime() + 86400_000);
  }
  return out;
}
