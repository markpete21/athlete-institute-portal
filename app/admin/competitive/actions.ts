'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { audit, type BalanceAttribute, type Sport } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { getPortalSession } from '@/lib/auth';
import { profileCan } from '@/lib/staff/staff';
import { buildLeagueSchedule, createDivision, runTeamBuilder, saveScore } from '@/lib/competitive/competitive';

async function requireStaff() {
  const session = await getPortalSession();
  if (!session.isStaff) throw new Error('Staff only.');
  return session;
}

export async function createDivisionAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = await createDivision({
    programId: Number(formData.get('programId')),
    name: String(formData.get('name') ?? '').trim() || 'Division',
    sport: String(formData.get('sport') ?? 'other') as Sport,
    maxTeams: formData.get('maxTeams') ? Number(formData.get('maxTeams')) : null,
    minPlayers: formData.get('minPlayers') ? Number(formData.get('minPlayers')) : null,
    maxPlayers: formData.get('maxPlayers') ? Number(formData.get('maxPlayers')) : null,
  }, session.userId!);
  redirect(`/competitive/${id}`);
}

export async function runBuilderAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const divisionId = Number(formData.get('divisionId'));
  const attributes = formData.getAll('attributes').map(String) as BalanceAttribute[];
  await runTeamBuilder({ divisionId, numTeams: Number(formData.get('numTeams')) || 2, attributes, actorClerkId: session.userId! });
  revalidatePath(`/competitive/${divisionId}`);
}

export async function buildScheduleAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const divisionId = Number(formData.get('divisionId'));
  await buildLeagueSchedule({
    divisionId,
    facilityId: Number(formData.get('facilityId')),
    startDate: String(formData.get('startDate')),
    weekdays: formData.getAll('weekday').map(Number),
    timeSlots: String(formData.get('timeSlots') ?? '18:00,19:00,20:00').split(',').map((s) => s.trim()).filter(Boolean),
    gameMinutes: Number(formData.get('gameMinutes')) || 60,
    numCourts: Number(formData.get('numCourts')) || 1,
    doubleRound: formData.get('doubleRound') === 'on',
    actorClerkId: session.userId!,
  });
  revalidatePath(`/competitive/${divisionId}`);
}

export async function saveScoreAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  // Score entry gated by the Module 5 capability matrix (convenor/coach on-site).
  if (session.profileId && !(await profileCan(session.profileId, 'score_entry', 'edit'))) {
    throw new Error('You do not have the score-entry capability.');
  }
  const divisionId = Number(formData.get('divisionId'));
  await saveScore({
    gameId: Number(formData.get('gameId')),
    homeScore: Number(formData.get('homeScore')),
    awayScore: Number(formData.get('awayScore')),
    overtime: formData.get('overtime') === 'on',
    liveStreamRef: String(formData.get('liveStreamRef') ?? '').trim() || null,
    actorClerkId: session.userId!,
  });
  revalidatePath(`/competitive/${divisionId}`);
}

/**
 * Compete. Portal visibility for a division: whether it appears on the public
 * site at all, and whether public rosters show full names or "Ava P.".
 * Defaults are set at creation by program type (leagues/clinics -> full names;
 * tournaments/rep -> masked; Academy -> never public) and overridden here.
 */
export async function saveCompeteSettingsAction(formData: FormData): Promise<void> {
  const s = await getPortalSession();
  if (!s.isStaff) throw new Error('Staff only.');
  const divisionId = Number(formData.get('divisionId'));
  const { error } = await supabaseAdmin()
    .from('divisions')
    .update({
      show_on_compete: formData.get('showOnCompete') === 'on',
      show_full_names: formData.get('showFullNames') === 'on',
    })
    .eq('id', divisionId);
  if (error) throw new Error(error.message);
  await audit({
    actorId: s.userId!,
    action: 'division.compete-settings',
    target: `division:${divisionId}`,
    meta: { showOnCompete: formData.get('showOnCompete') === 'on', showFullNames: formData.get('showFullNames') === 'on' },
  });
  revalidatePath(`/competitive/${divisionId}`);
}
