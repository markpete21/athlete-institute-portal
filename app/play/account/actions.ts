'use server';

import { revalidatePath } from 'next/cache';
import { canManageFamily } from '@ai/foundation';
import { getPortalSession } from '@/lib/auth';
import { addFamilyMember, getOrCreateFamily, memberRowFor, removeFamilyMember } from '@/lib/family';
import { getOrCreateProfile } from '@/lib/profile';

/** HoH-only guard shared by the mutations below. */
async function requireHoh() {
  const session = await getPortalSession();
  if (!session.userId) throw new Error('Sign in first.');
  const profile = await getOrCreateProfile();
  const family = await getOrCreateFamily(profile);
  const me = memberRowFor(family, profile.id);
  if (!me || !canManageFamily(me.member_role)) {
    throw new Error('Only the Head of Household can manage family members.');
  }
  return { session, family };
}

export async function addMemberAction(formData: FormData): Promise<void> {
  const { session, family } = await requireHoh();

  const firstName = String(formData.get('firstName') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();
  const dob = String(formData.get('dob') ?? '').trim() || null;
  const email = String(formData.get('email') ?? '').trim() || null;
  const memberRole = String(formData.get('memberRole') ?? 'dependent') as
    | 'secondary'
    | 'dependent'
    | 'adult';

  if (!firstName || !lastName) throw new Error('First and last name are required.');
  if (memberRole === 'dependent' && !dob) throw new Error('Dependents need a date of birth.');

  await addFamilyMember({
    familyId: family.id,
    firstName,
    lastName,
    dob,
    email,
    memberRole,
    actorClerkId: session.userId!,
  });
  revalidatePath('/account');
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const { session, family } = await requireHoh();
  const memberId = Number(formData.get('memberId'));
  if (!family.members.some((m) => m.id === memberId)) {
    throw new Error('That member is not in your household.');
  }
  await removeFamilyMember(memberId, session.userId!);
  revalidatePath('/account');
}
