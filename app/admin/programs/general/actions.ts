'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@ai/foundation/supabase';
import type { NotifyChannel } from '@ai/foundation/notify';
import { getPortalSession } from '@/lib/auth';
import { rescheduleSession, type SessionKind } from '@/lib/programs/reschedule';

async function requireStaff() {
  const s = await getPortalSession();
  if (!s.isStaff) throw new Error('Staff only.');
  return s;
}

/** Add a bookable drop-in date with per-session capacity + price. */
export async function addDropInSessionAction(formData: FormData): Promise<void> {
  await requireStaff();
  const programId = Number(formData.get('programId'));
  const date = String(formData.get('date'));
  const start = String(formData.get('start'));
  const end = String(formData.get('end'));
  await supabaseAdmin().from('dropin_sessions').insert({
    program_id: programId,
    session_date: date,
    starts_at: new Date(`${date}T${start}`).toISOString(),
    ends_at: new Date(`${date}T${end}`).toISOString(),
    capacity: formData.get('capacity') ? Number(formData.get('capacity')) : null,
    price_cents: Math.round(Number(formData.get('price') ?? 0) * 100) || 0,
  });
  revalidatePath(`/programs/general/${programId}`);
}

/** Reschedule a session: move to a new date, or postpone to TBD. */
export async function rescheduleAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const programId = Number(formData.get('programId'));
  const newDate = String(formData.get('newDate') ?? '').trim();
  const newStart = String(formData.get('newStart') ?? '').trim();
  const newEnd = String(formData.get('newEnd') ?? '').trim();
  const channels = (['email', 'sms', 'push'] as NotifyChannel[]).filter((c) => formData.get(`ch_${c}`) === 'on');
  const withDate = newDate && newStart && newEnd;

  await rescheduleSession({
    programId,
    sessionId: Number(formData.get('sessionId')),
    kind: String(formData.get('kind')) as SessionKind,
    newStartsAt: withDate ? new Date(`${newDate}T${newStart}`).toISOString() : null,
    newEndsAt: withDate ? new Date(`${newDate}T${newEnd}`).toISOString() : null,
    notifyChannels: channels,
    actorClerkId: session.userId!,
  });
  revalidatePath(`/programs/general/${programId}`);
}
