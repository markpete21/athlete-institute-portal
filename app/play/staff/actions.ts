'use server';

import { revalidatePath } from 'next/cache';
import { getPortalSession } from '@/lib/auth';
import { removeUnavailability, staffForProfile, submitUnavailability } from '@/lib/staff/staff';

/**
 * Self-service actions for a staff member's own view. The guard is OWNERSHIP,
 * not admin access: the signed-in profile must be the one linked to the staff
 * record (a coach with no admin role can still submit their own dates).
 */
async function requireOwnStaffRecord() {
  const session = await getPortalSession();
  if (!session.profileId) throw new Error('Sign in first.');
  const staff = await staffForProfile(session.profileId);
  if (!staff) throw new Error('No staff record is linked to this account.');
  return staff;
}

export async function submitMyUnavailabilityAction(formData: FormData): Promise<void> {
  const staff = await requireOwnStaffRecord();
  const date = String(formData.get('date') ?? '');
  if (!date) throw new Error('Pick a date.');
  await submitUnavailability(staff.id, date, String(formData.get('note') ?? '').trim() || null);
  revalidatePath('/staff');
}

export async function removeMyUnavailabilityAction(formData: FormData): Promise<void> {
  const staff = await requireOwnStaffRecord();
  await removeUnavailability(staff.id, String(formData.get('date') ?? ''));
  revalidatePath('/staff');
}
