'use server';

import { revalidatePath } from 'next/cache';
import { getPortalSession } from '@/lib/auth';
import { closeContest, createChallenge, createContest, type ChallengeRule, type GameKey } from '@/lib/promotions/promotions';

async function requireStaff() {
  const s = await getPortalSession();
  if (!s.isStaff) throw new Error('Staff only.');
  return s;
}

export async function createContestAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  await createContest({
    name: String(formData.get('name') ?? 'Contest'),
    gameKey: String(formData.get('gameKey')) as GameKey,
    startsAt: new Date(String(formData.get('startsAt'))).toISOString(),
    endsAt: new Date(String(formData.get('endsAt'))).toISOString(),
    rewardTopN: Number(formData.get('topN') ?? 5),
    rewardPoints: Number(formData.get('points') ?? 2500),
    announce: formData.get('announce') === 'on',
  }, s.userId!);
  revalidatePath('/promotions');
}

export async function closeContestAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  await closeContest(Number(formData.get('contestId')), s.userId!);
  revalidatePath('/promotions');
}

export async function createChallengeAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  const kind = String(formData.get('kind')) as 'first_n' | 'do_x_by_date' | 'streak' | 'referral_push';
  const rule: ChallengeRule = {};
  if (kind === 'first_n') rule.n = Number(formData.get('n') ?? 10);
  if (kind === 'do_x_by_date') rule.count = Number(formData.get('count') ?? 3);
  await createChallenge({
    name: String(formData.get('name') ?? 'Challenge'),
    kind,
    rule,
    points: Number(formData.get('points') ?? 500),
    endsAt: formData.get('endsAt') ? new Date(String(formData.get('endsAt'))).toISOString() : null,
    announce: formData.get('announce') === 'on',
  }, s.userId!);
  revalidatePath('/promotions');
}
