'use server';

import { revalidatePath } from 'next/cache';
import { submitFeedback } from '@/lib/feedback/feedback';

/** Public: submit the pre-identified feedback form (star-first; details optional). */
export async function submitFeedbackAction(formData: FormData): Promise<void> {
  const token = String(formData.get('token'));
  const rating = Number(formData.get('rating'));
  const comment = String(formData.get('comment') ?? '').trim() || null;

  // Any answered non-star question makes it a FULL form submission (250 pts).
  const answers: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith('q_') && String(v).trim()) answers[k.slice(2)] = String(v);
  }

  await submitFeedback(token, { rating, comment, answers: Object.keys(answers).length ? answers : null });
  revalidatePath(`/feedback/${token}`);
}
