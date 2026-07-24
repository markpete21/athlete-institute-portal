import 'server-only';
import { randomBytes } from 'node:crypto';
import { audit, joinLinkExpiry, joinLinkOpen, leagueLineCents, smallGroupComplete, type LeaguePath } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { addRosterMember } from '@/lib/competitive/competitive';

/**
 * Leagues registration front-end (Module 7). The four paths create Module 4
 * registrations + Module 6 roster rows; captains create teams with join links;
 * small groups hold until complete for the Module 6 balancer.
 */

export async function configureLeague(input: { programId: number; pricing: 'player' | 'team' | 'both'; teamRateCents?: number; paths?: LeaguePath[] }, actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('programs').update({ league_pricing: input.pricing, team_rate_cents: input.teamRateCents ?? 0, league_paths: input.paths ?? ['captain', 'member', 'small_group', 'free_agent'] }).eq('id', input.programId);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'league.configured', target: `program:${input.programId}`, meta: { pricing: input.pricing } });
}

async function programConfig(programId: number) {
  const { data, error } = await supabaseAdmin().from('programs').select('base_price_cents, league_pricing, team_rate_cents, season_key, registration_opens_at').eq('id', programId).single();
  if (error) throw new Error(error.message);
  return data;
}

/** Create a registration row for a family member in a program. */
async function registerMember(programId: number, familyMemberId: number, familyId: number | null, path: LeaguePath, extra: Record<string, unknown> = {}): Promise<number> {
  const { deriveStandingFor } = await import('@/lib/programs/programs');
  const standing = await deriveStandingFor(familyMemberId, programId);
  const { data, error } = await supabaseAdmin()
    .from('registrations')
    .insert({ program_id: programId, family_member_id: familyMemberId, family_id: familyId, status: 'active', standing, league_path: path, ...extra })
    .select('id')
    .single();
  if (error) throw new Error(`registration failed: ${error.message}`);
  return data.id;
}

/** Path 1: Captain creates a team (+ join link) and registers into it. */
export async function captainSignup(input: { programId: number; divisionId: number; teamName: string; familyMemberId: number; familyId: number | null; payTeamRate: boolean; startDateISO: string; actorClerkId: string }): Promise<{ teamId: number; joinToken: string; registrationId: number }> {
  const db = supabaseAdmin();
  const token = randomBytes(9).toString('base64url');
  const regId = await registerMember(input.programId, input.familyMemberId, input.familyId, 'captain', { team_id: null });
  const { data: team, error } = await db
    .from('teams')
    .insert({ division_id: input.divisionId, name: input.teamName.trim(), join_token: token, captain_registration_id: regId, join_expires_at: joinLinkExpiry(input.startDateISO) })
    .select('id')
    .single();
  if (error) throw new Error(`team create failed: ${error.message}`);
  await db.from('registrations').update({ team_id: team.id }).eq('id', regId);
  await addRosterMember({ divisionId: input.divisionId, registrationId: regId, lockedTeamId: team.id }); // captain team stays intact
  await audit({ actorId: input.actorClerkId, action: 'league.captain-signup', target: `team:${team.id}`, meta: { program: input.programId } });
  return { teamId: team.id, joinToken: token, registrationId: regId };
}

/** Path 2: Member joins a team by list or link (validated). */
export async function memberJoin(input: { joinToken: string; familyMemberId: number; familyId: number | null; actorClerkId: string }): Promise<{ registrationId: number; teamId: number }> {
  const db = supabaseAdmin();
  const { data: team, error } = await db.from('teams').select('id, division_id, join_expires_at, captain_registration_id, divisions(program_id, max_players)').eq('join_token', input.joinToken).maybeSingle();
  if (error) throw new Error(error.message);
  if (!team) throw new Error('Invalid join link.');
  const div = team.divisions as unknown as { program_id: number; max_players: number | null };

  const { count } = await db.from('team_members').select('id', { count: 'exact', head: true }).eq('team_id', team.id);
  const status = joinLinkOpen({ expiresAtISO: team.join_expires_at, memberCount: count ?? 0, maxPlayers: div.max_players, nowISO: new Date().toISOString() });
  if (!status.open) throw new Error(status.reason === 'full' ? 'This team is full.' : 'This join link has expired.');

  const regId = await registerMember(div.program_id, input.familyMemberId, input.familyId, 'member', { team_id: team.id });
  await addRosterMember({ divisionId: team.division_id, registrationId: regId, lockedTeamId: team.id });
  await audit({ actorId: input.actorClerkId, action: 'league.member-join', target: `team:${team.id}`, meta: { registration: regId } });
  return { registrationId: regId, teamId: team.id };
}

/** Path 3: Small group — each pays individually, held together until complete. */
export async function smallGroupSignup(input: { programId: number; divisionId: number; familyMemberId: number; familyId: number | null; groupKey: string; teammateNames: string[]; actorClerkId: string }): Promise<{ registrationId: number; complete: boolean }> {
  const db = supabaseAdmin();
  const regId = await registerMember(input.programId, input.familyMemberId, input.familyId, 'small_group', { group_key: input.groupKey, group_member_names: input.teammateNames });
  await addRosterMember({ divisionId: input.divisionId, registrationId: regId, groupKey: input.groupKey });

  const { count } = await db.from('registrations').select('id', { count: 'exact', head: true }).eq('program_id', input.programId).eq('group_key', input.groupKey).eq('status', 'active');
  // Expected names come from the FIRST member who defined the group.
  const { data: first } = await db.from('registrations').select('group_member_names').eq('program_id', input.programId).eq('group_key', input.groupKey).not('group_member_names', 'is', null).order('id').limit(1).maybeSingle();
  const expected = (first?.group_member_names as string[] | null) ?? input.teammateNames;
  const complete = smallGroupComplete(expected, count ?? 0);
  await audit({ actorId: input.actorClerkId, action: 'league.small-group-signup', target: `registration:${regId}`, meta: { group: input.groupKey, complete } });
  return { registrationId: regId, complete };
}

/** Path 4: Free agent — pays player fee, placed later by the M6 builder. */
export async function freeAgentSignup(input: { programId: number; divisionId: number; familyMemberId: number; familyId: number | null; actorClerkId: string }): Promise<{ registrationId: number }> {
  const regId = await registerMember(input.programId, input.familyMemberId, input.familyId, 'free_agent');
  await addRosterMember({ divisionId: input.divisionId, registrationId: regId });
  await audit({ actorId: input.actorClerkId, action: 'league.free-agent', target: `registration:${regId}` });
  return { registrationId: regId };
}

/** The fee for a given path (feeds Module 4 checkout). */
export async function leaguePriceCents(programId: number, path: LeaguePath, captainPaysTeam = false): Promise<number> {
  const cfg = await programConfig(programId);
  return leagueLineCents({ pricing: cfg.league_pricing, path, playerFeeCents: cfg.base_price_cents, teamRateCents: cfg.team_rate_cents, captainPaysTeam });
}
