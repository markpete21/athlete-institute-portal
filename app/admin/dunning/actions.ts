'use server';

import { revalidatePath } from 'next/cache';
import { getPortalSession } from '@/lib/auth';
import { updateDunningConfig } from '@/lib/dunning/dunning';
import { explainDraft } from '@/lib/team-explainer/explainer';

async function requireStaff() {
  const s = await getPortalSession();
  if (!s.isStaff) throw new Error('Staff only.');
  return s;
}

export async function configAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
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
