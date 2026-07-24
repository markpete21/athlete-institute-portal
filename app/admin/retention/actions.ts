'use server';

import { revalidatePath } from 'next/cache';
import { getPortalSession } from '@/lib/auth';
import { recomputeAll, takeAction, updateWeights } from '@/lib/retention/retention';
import type { RuleWeights } from '@ai/foundation';

async function requireStaff() {
  const s = await getPortalSession();
  if (!s.isStaff) throw new Error('Staff only.');
  return s;
}

export async function actionAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  await takeAction(Number(formData.get('flagId')), String(formData.get('kind')) as 'offer' | 'call' | 'discount', s.userId!, String(formData.get('note') ?? '') || undefined);
  revalidatePath('/retention');
}

export async function recomputeAction(): Promise<void> {
  await requireStaff();
  await recomputeAll();
  revalidatePath('/retention');
}

export async function weightsAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  const patch: Partial<RuleWeights> = {};
  for (const key of ['reenrollTiming', 'lowFeedback', 'abandonedCart', 'paymentFriction', 'emailDisengaged', 'siblingGap', 'crossAppTrend'] as const) {
    const v = formData.get(key);
    if (v !== null && v !== '') patch[key] = Number(v);
  }
  await updateWeights(patch, s.userId!);
  revalidatePath('/retention');
}
