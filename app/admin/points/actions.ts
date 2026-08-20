'use server';

import { revalidatePath } from 'next/cache';
import { getPortalSession } from '@/lib/auth';
import { clawBackReferral, flagReferral, manualGrant, updateEarnRule } from '@/lib/points/points';
import { profileCan } from '@/lib/staff/staff';

async function requireStaff() {
  const s = await getPortalSession();
  if (!s.isStaff) throw new Error('Staff only.');
  return s;
}

// Points are money (100 pts = $1) — rule changes, grants and clawbacks are
// gated by the Module 5 pay capability like every other financial control.
async function requirePayCap() {
  const s = await requireStaff();
  if (s.profileId && !(await profileCan(s.profileId, 'pay', 'edit'))) throw new Error('You lack the pay capability.');
  return s;
}

export async function ruleAction(formData: FormData): Promise<void> {
  const s = await requirePayCap();
  await updateEarnRule(String(formData.get('ruleKey')), { enabled: formData.get('enabled') === 'on', points: Number(formData.get('points')) }, s.userId!);
  revalidatePath('/points');
}

export async function grantAction(formData: FormData): Promise<void> {
  const s = await requirePayCap();
  await manualGrant(Number(formData.get('familyId')), Number(formData.get('points')), String(formData.get('reason') ?? ''), s.userId!);
  revalidatePath('/points');
}

export async function flagAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  await flagReferral(Number(formData.get('referralId')), String(formData.get('reason') ?? 'suspicious'), s.userId!);
  revalidatePath('/points');
}

export async function clawbackAction(formData: FormData): Promise<void> {
  const s = await requirePayCap();
  await clawBackReferral(Number(formData.get('referralId')), String(formData.get('reason') ?? 'fraud'), s.userId!);
  revalidatePath('/points');
}
