'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff, requireStaffCapability } from '@/lib/auth';
import { clawBackReferral, flagReferral, manualGrant, updateEarnRule } from '@/lib/points/points';

// Points are money (100 pts = $1) — rule changes, grants and clawbacks are
// gated by the Module 5 pay capability like every other financial control.
const requirePayCap = () => requireStaffCapability('pay', 'edit');

export async function ruleAction(formData: FormData): Promise<void> {
  const s = await requirePayCap();
  await updateEarnRule(String(formData.get('ruleKey')), { enabled: formData.get('enabled') === 'on', points: Number(formData.get('points')) }, s.userId);
  revalidatePath('/points');
}

export async function grantAction(formData: FormData): Promise<void> {
  const s = await requirePayCap();
  await manualGrant(Number(formData.get('familyId')), Number(formData.get('points')), String(formData.get('reason') ?? ''), s.userId);
  revalidatePath('/points');
}

export async function flagAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  await flagReferral(Number(formData.get('referralId')), String(formData.get('reason') ?? 'suspicious'), s.userId);
  revalidatePath('/points');
}

export async function clawbackAction(formData: FormData): Promise<void> {
  const s = await requirePayCap();
  await clawBackReferral(Number(formData.get('referralId')), String(formData.get('reason') ?? 'fraud'), s.userId);
  revalidatePath('/points');
}
