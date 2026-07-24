'use server';

import { revalidatePath } from 'next/cache';
import type { TuitionTier } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { getPortalSession } from '@/lib/auth';
import { createTeam, placeOnTeam, respondToOffer, sendOffer, setScholarship } from '@/lib/academy/academy';

async function requireStaff() {
  const s = await getPortalSession();
  if (!s.isStaff) throw new Error('Staff only.');
  return s;
}

export async function createTeamAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  const academyId = Number(formData.get('academyId'));
  await createTeam({
    academyId,
    name: String(formData.get('name') ?? ''),
    capacity: formData.get('capacity') ? Number(formData.get('capacity')) : null,
    tuition: {
      room_board: Math.round(Number(formData.get('roomBoard') ?? 0) * 100),
      commuter: Math.round(Number(formData.get('commuter') ?? 0) * 100),
      international: Math.round(Number(formData.get('international') ?? 0) * 100),
    },
  }, s.userId!);
  revalidatePath(`/academy/${academyId}`);
}

export async function placeAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  const academyId = Number(formData.get('academyId'));
  await placeOnTeam({ academyId, teamId: Number(formData.get('teamId')), familyMemberId: Number(formData.get('familyMemberId')), familyId: formData.get('familyId') ? Number(formData.get('familyId')) : null }, s.userId!);
  revalidatePath(`/academy/${academyId}`);
}

export async function scholarshipAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  await setScholarship(Number(formData.get('playerId')), Math.round(Number(formData.get('scholarship') ?? 0) * 100), s.userId!);
  revalidatePath(`/academy/${formData.get('academyId')}`);
}

export async function sendOfferAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  await sendOffer({
    playerId: Number(formData.get('playerId')),
    teamId: Number(formData.get('teamId')),
    tuitionTier: String(formData.get('tuitionTier')) as TuitionTier,
    depositCents: formData.get('depositAmount') ? Math.round(Number(formData.get('depositAmount')) * 100) : null,
    depositPct: formData.get('depositPct') ? Number(formData.get('depositPct')) : null,
  }, s.userId!);
  revalidatePath(`/academy/${formData.get('academyId')}`);
}

/** Staff can also record an offer response on behalf of a family (e.g. verbal). */
export async function respondAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  const { data: offer } = await supabaseAdmin().from('academy_offers').select('token').eq('id', Number(formData.get('offerId'))).single();
  if (offer) await respondToOffer(offer.token, formData.get('accept') === 'yes', s.userId!);
  revalidatePath(`/academy/${formData.get('academyId')}`);
}
