'use server';

import { redirect } from 'next/navigation';
import { requireCustomer } from '@/lib/auth';
import { getOrCreateFamily } from '@/lib/family';
import { id, str } from '@/lib/forms';
import { memberJoin } from '@/lib/leagues/leagues';
import { getOrCreateProfile } from '@/lib/profile';

/**
 * Captain join link → register one of MY household members onto the team.
 * Ownership is the guard: the member must be in the caller's household (own
 * or shared-in); memberJoin re-validates the link (expiry, max players).
 */
export async function joinTeamAction(formData: FormData): Promise<void> {
  const session = await requireCustomer();
  const token = str(formData.get('token'));
  const memberId = id(formData.get('memberId'), 'family member');
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(token)) throw new Error('Invalid join link.');
  const family = await getOrCreateFamily(await getOrCreateProfile());
  if (!family.members.some((m) => m.id === memberId)) throw new Error('That member is not in your household.');
  await memberJoin({ joinToken: token, familyMemberId: memberId, familyId: family.id, actorClerkId: session.userId });
  redirect('/account?joined=1');
}
