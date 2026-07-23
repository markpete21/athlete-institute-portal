'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { BalanceAttribute, Sport } from '@ai/foundation';
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
