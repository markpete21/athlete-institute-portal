import 'server-only';
import { audit, singleElimination, type BracketMatch } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Tournaments front-end (Module 9). Team-entered + team-priced: a team signs
 * up, uploads a roster, picks a division, pays once. Scheduling/standings/
 * portal reuse Module 6 (championship = bracket, showcase = games, no winner).
 * Coaches on an uploaded roster can be account-less Module 5 staff records.
 */

export async function setTournamentMode(programId: number, mode: 'championship' | 'showcase', actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('programs').update({ tournament_mode: mode }).eq('id', programId);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'tournament.mode-set', target: `program:${programId}`, meta: { mode } });
}

export interface RosterPlayer { firstName: string; lastName: string; jerseySize?: string | null; skill?: number | null }

/**
 * Register a team: creates the Module 6 team in the chosen division, a single
 * team-entry registration (team-priced), and a team_member roster row per
 * uploaded player. Optionally records an account-less coach (Module 5).
 */
export async function registerTeam(input: {
  programId: number;
  divisionId: number;
  teamName: string;
  captainFamilyMemberId: number;
  familyId: number | null;
  roster: RosterPlayer[];
  coachName?: string | null;
  actorClerkId: string;
}): Promise<{ teamId: number; entryRegistrationId: number; rosterCount: number; coachStaffId: number | null }> {
  const db = supabaseAdmin();

  // Optional account-less coach (Module 5).
  let coachStaffId: number | null = null;
  if (input.coachName?.trim()) {
    const [first, ...rest] = input.coachName.trim().split(' ');
    const { data: coach } = await db.from('staff').insert({ first_name: first, last_name: rest.join(' ') || '-', created_by: input.actorClerkId }).select('id').single();
    coachStaffId = coach!.id;
  }

  const { data: team, error } = await db.from('teams').insert({ division_id: input.divisionId, name: input.teamName.trim(), coach_staff_id: coachStaffId }).select('id').single();
  if (error) throw new Error(`team create failed: ${error.message}`);

  // One team-entry registration (the payable entry), by the captain.
  const { deriveStandingFor } = await import('@/lib/programs/programs');
  const standing = await deriveStandingFor(input.captainFamilyMemberId, input.programId);
  const { data: entry, error: eErr } = await db
    .from('registrations')
    .insert({ program_id: input.programId, family_member_id: input.captainFamilyMemberId, family_id: input.familyId, status: 'active', standing, team_id: team.id, league_path: 'captain' })
    .select('id')
    .single();
  if (eErr) throw new Error(`entry registration failed: ${eErr.message}`);
  await db.from('teams').update({ entry_registration_id: entry.id, captain_registration_id: entry.id }).eq('id', team.id);

  // Roster rows (team_members) - players uploaded, not individually registered.
  if (input.roster.length) {
    const { error: rErr } = await db.from('team_members').insert(input.roster.map(() => ({ division_id: input.divisionId, team_id: team.id, locked: true })));
    if (rErr) throw new Error(`roster upload failed: ${rErr.message}`);
  }

  await audit({ actorId: input.actorClerkId, action: 'tournament.team-registered', target: `team:${team.id}`, meta: { program: input.programId, roster: input.roster.length, coachStaffId } });
  return { teamId: team.id, entryRegistrationId: entry.id, rosterCount: input.roster.length, coachStaffId };
}

/** Championship bracket for a division's registered teams (seeded by entry order). */
export async function buildBracket(divisionId: number): Promise<{ rounds: number; firstRound: BracketMatch[]; teamNames: string[] }> {
  const db = supabaseAdmin();
  const { data: teams } = await db.from('teams').select('id, name').eq('division_id', divisionId).order('sort_order').order('id');
  const bracket = singleElimination((teams ?? []).length);
  return { ...bracket, teamNames: (teams ?? []).map((t) => t.name) };
}
