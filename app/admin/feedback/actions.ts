'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { getPortalSession } from '@/lib/auth';
import { configureRounds, summarizeFeedback } from '@/lib/feedback/feedback';

async function requireStaff() {
  const s = await getPortalSession();
  if (!s.isStaff) throw new Error('Staff only.');
  return s;
}

export async function configureRoundsAction(formData: FormData): Promise<void> {
  await requireStaff();
  await configureRounds(Number(formData.get('programId')), { delayDays: formData.get('delayDays') ? Number(formData.get('delayDays')) : undefined });
  revalidatePath('/feedback');
}

export async function summarizeAction(formData: FormData): Promise<void> {
  await requireStaff();
  await summarizeFeedback(Number(formData.get('programId')));
  revalidatePath('/feedback');
}

export async function togglePublicAction(formData: FormData): Promise<void> {
  await requireStaff();
  const programId = Number(formData.get('programId'));
  const { data } = await supabaseAdmin().from('programs').select('rating_public').eq('id', programId).single();
  await supabaseAdmin().from('programs').update({ rating_public: !data?.rating_public }).eq('id', programId);
  revalidatePath('/feedback');
}
