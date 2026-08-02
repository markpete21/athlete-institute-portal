'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { getPortalSession } from '@/lib/auth';
import { purchaseSessions } from '@/lib/programs/dropin';

/** Public: a family buys the drop-in dates they multi-selected (pay per session). */
export async function buyDropInAction(formData: FormData): Promise<void> {
  const session = await getPortalSession();
  if (!session.userId || !session.familyId) throw new Error('Please sign in to register.');
  if (!session.canTransact) {
    throw new Error('This account cannot register right now — please contact the front desk.');
  }
  const programId = Number(formData.get('programId'));
  const familyMemberId = Number(formData.get('familyMemberId'));
  const sessionIds = formData.getAll('sessionIds').map((v) => Number(v)).filter(Boolean);

  // The member must be in this household (primary or shared dual-household).
  const { data: member } = await supabaseAdmin()
    .from('family_members')
    .select('id, family_id, second_family_id')
    .eq('id', familyMemberId)
    .maybeSingle();
  if (!member || (member.family_id !== session.familyId && member.second_family_id !== session.familyId)) {
    throw new Error('That member is not in your household.');
  }

  await purchaseSessions({
    programId,
    familyMemberId,
    familyId: session.familyId,
    sessionIds,
    actorClerkId: session.userId,
  });
  revalidatePath(`/programs/general/${programId}`);
}
