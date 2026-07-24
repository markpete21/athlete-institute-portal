'use server';

import { revalidatePath } from 'next/cache';
import { getPortalSession } from '@/lib/auth';
import {
  addTryoutSession, cancelOffer, createClub, createTeam, saveEvaluation, sendOffer, setFlag, syncTryoutRoster,
  type Gender,
} from '@/lib/club/club';

async function requireStaff() {
  const s = await getPortalSession();
  if (!s.isStaff) throw new Error('Staff only.');
  return s;
}

export async function createClubAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  await createClub({ name: String(formData.get('name') ?? ''), sport: String(formData.get('sport') ?? '') || null }, s.userId!);
  revalidatePath('/club');
}

export async function createTeamAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  const clubId = Number(formData.get('clubId'));
  await createTeam({
    clubId,
    name: String(formData.get('name') ?? ''),
    levelLabel: String(formData.get('levelLabel') ?? ''),
    gender: String(formData.get('gender') ?? 'mixed') as Gender,
    dobMin: String(formData.get('dobMin') ?? '') || null,
    dobMax: String(formData.get('dobMax') ?? '') || null,
    seasonFeeCents: Math.round(Number(formData.get('seasonFee') ?? 0) * 100) || 0,
  }, s.userId!);
  revalidatePath(`/club/${clubId}`);
}

export async function syncRosterAction(formData: FormData): Promise<void> {
  await requireStaff();
  const clubId = Number(formData.get('clubId'));
  await syncTryoutRoster(clubId, String(formData.get('levelLabel')), String(formData.get('gender')) as Gender);
  revalidatePath(`/club/${clubId}`);
}

export async function addTryoutSessionAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  const clubId = Number(formData.get('clubId'));
  await addTryoutSession({ clubId, programId: Number(formData.get('programId')), levelLabel: String(formData.get('levelLabel')), gender: String(formData.get('gender')) as Gender }, s.userId!);
  revalidatePath(`/club/${clubId}`);
}

export async function flagAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  await setFlag(Number(formData.get('playerId')), String(formData.get('flag')) as 'selected' | 'considering' | 'out', s.userId!, formData.get('teamId') ? Number(formData.get('teamId')) : null);
  revalidatePath(`/club/${formData.get('clubId')}`);
}

export async function saveEvalAction(formData: FormData): Promise<void> {
  await requireStaff();
  await saveEvaluation(Number(formData.get('playerId')), formData.get('rating') ? Number(formData.get('rating')) : null, String(formData.get('notes') ?? '') || null);
  revalidatePath(`/club/${formData.get('clubId')}`);
}

export async function sendOfferAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  const mode = String(formData.get('mode')) as 'verbal' | 'deposit';
  await sendOffer({
    playerId: Number(formData.get('playerId')),
    teamId: Number(formData.get('teamId')),
    mode,
    depositCents: mode === 'deposit' && formData.get('depositAmount') ? Math.round(Number(formData.get('depositAmount')) * 100) : null,
    depositPct: mode === 'deposit' && formData.get('depositPct') ? Number(formData.get('depositPct')) : null,
  }, s.userId!);
  revalidatePath(`/club/${formData.get('clubId')}`);
}

export async function cancelOfferAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  await cancelOffer(Number(formData.get('offerId')), s.userId!);
  revalidatePath(`/club/${formData.get('clubId')}`);
}
