'use server';

import { revalidatePath } from 'next/cache';
import { getPortalSession } from '@/lib/auth';
import { updateDunningConfig } from '@/lib/dunning/dunning';
import { profileCan } from '@/lib/staff/staff';
import { explainDraft } from '@/lib/team-explainer/explainer';

async function requireStaff() {
  const s = await getPortalSession();
  if (!s.isStaff) throw new Error('Staff only.');
  return s;
}

export async function configAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  // Escalation timing drives real charges + collections — Module 5 pay capability.
  if (s.profileId && !(await profileCan(s.profileId, 'pay', 'edit'))) throw new Error('You lack the pay capability.');
  await updateDunningConfig({
    retryAfterDays: Number(formData.get('retryAfterDays')),
    emailAfterDays: Number(formData.get('emailAfterDays')),
    smsAfterDays: Number(formData.get('smsAfterDays')),
    taskAfterDays: Number(formData.get('taskAfterDays')),
  }, s.userId!);
  revalidatePath('/dunning');
}

export async function explainAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  await explainDraft(Number(formData.get('divisionId')), s.userId!);
  revalidatePath('/dunning');
}
