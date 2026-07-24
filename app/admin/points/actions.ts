'use server';

import { revalidatePath } from 'next/cache';
import { getPortalSession } from '@/lib/auth';
import { clawBackReferral, flagReferral, manualGrant, updateEarnRule } from '@/lib/points/points';

async function requireStaff() {
  const s = await getPortalSession();
  if (!s.isStaff) throw new Error('Staff only.');
  return s;
}

export async function ruleAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  await updateEarnRule(String(formData.get('ruleKey')), { enabled: formData.get('enabled') === 'on', points: Number(formData.get('points')) }, s.userId!);
  revalidatePath('/points');
}

export async function grantAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  await manualGrant(Number(formData.get('familyId')), Number(formData.get('points')), String(formData.get('reason') ?? ''), s.userId!);
  revalidatePath('/points');
}

export async function flagAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  await flagReferral(Number(formData.get('referralId')), String(formData.get('reason') ?? 'suspicious'), s.userId!);
  revalidatePath('/points');
}

export async function clawbackAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  await clawBackReferral(Number(formData.get('referralId')), String(formData.get('reason') ?? 'fraud'), s.userId!);
  revalidatePath('/points');
}
