'use server';

import { revalidatePath } from 'next/cache';
import { getPortalSession } from '@/lib/auth';
import { purchaseSessions } from '@/lib/programs/dropin';

/** Public: a family buys the drop-in dates they multi-selected (pay per session). */
export async function buyDropInAction(formData: FormData): Promise<void> {
  const session = await getPortalSession();
  if (!session.userId || !session.familyId) throw new Error('Please sign in to register.');
  const programId = Number(formData.get('programId'));
  const familyMemberId = Number(formData.get('familyMemberId'));
  const sessionIds = formData.getAll('sessionIds').map((v) => Number(v)).filter(Boolean);

  await purchaseSessions({
    programId,
    familyMemberId,
    familyId: session.familyId,
    sessionIds,
    actorClerkId: session.userId,
  });
  revalidatePath(`/programs/general/${programId}`);
}
