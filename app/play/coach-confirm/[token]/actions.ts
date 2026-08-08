'use server';

import { redirect } from 'next/navigation';
import { respondToConfirmation, confirmationByToken } from '@/lib/competitive/coachConfirmations';

/**
 * PUBLIC action - no auth by design. The token in the form body is the
 * credential (same model as rental quote signing): it was emailed to the
 * coach, and we re-resolve it server-side before writing anything.
 */
export async function respondAction(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '');
  const view = await confirmationByToken(token);
  if (!view) throw new Error('This confirmation link is no longer valid.');

  const decision = formData.get('decision') === 'declined' ? 'declined' : 'confirmed';
  const answers: Record<string, string> = {};
  if (decision === 'confirmed') {
    view.questions.forEach((q, i) => {
      const v = String(formData.get(`q_${i}`) ?? '').trim();
      if (v) answers[q] = v;
    });
  }
  await respondToConfirmation(token, {
    decision,
    answers,
    note: String(formData.get('note') ?? '').trim() || null,
  });
  redirect(`/coach-confirm/${token}?done=1`);
}
