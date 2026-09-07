'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff, requireStaffCapability } from '@/lib/auth';
import { updateDunningConfig } from '@/lib/dunning/dunning';
import { explainDraft } from '@/lib/team-explainer/explainer';

export async function configAction(formData: FormData): Promise<void> {
  // Escalation timing drives real charges + collections — Module 5 pay capability.
  const s = await requireStaffCapability('pay', 'edit');
  await updateDunningConfig({
    retryAfterDays: Number(formData.get('retryAfterDays')),
    emailAfterDays: Number(formData.get('emailAfterDays')),
    smsAfterDays: Number(formData.get('smsAfterDays')),
    taskAfterDays: Number(formData.get('taskAfterDays')),
  }, s.userId);
  revalidatePath('/dunning');
}

export async function explainAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  await explainDraft(Number(formData.get('divisionId')), s.userId);
  revalidatePath('/dunning');
}
