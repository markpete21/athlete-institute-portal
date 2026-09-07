'use server';

import { revalidatePath } from 'next/cache';
import { torontoInstant } from '@ai/foundation';
import { ok, supabaseAdmin } from '@ai/foundation/supabase';
import type { NotifyChannel } from '@ai/foundation/notify';
import { requireStaff } from '@/lib/auth';
import { rescheduleSession, type SessionKind } from '@/lib/programs/reschedule';

/** Add a bookable drop-in date with per-session capacity + price. */
export async function addDropInSessionAction(formData: FormData): Promise<void> {
  await requireStaff();
  const programId = Number(formData.get('programId'));
  const date = String(formData.get('date'));
  const start = String(formData.get('start'));
  const end = String(formData.get('end'));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) throw new Error('Date and start/end times are required.');
  ok(await supabaseAdmin().from('dropin_sessions').insert({
    program_id: programId,
    session_date: date,
    starts_at: torontoInstant(date, start),
    ends_at: torontoInstant(date, end),
    capacity: formData.get('capacity') ? Number(formData.get('capacity')) : null,
    price_cents: Math.round(Number(formData.get('price') ?? 0) * 100) || 0,
  }), 'dropin_session.insert');
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
    newStartsAt: withDate ? torontoInstant(newDate, newStart) : null,
    newEndsAt: withDate ? torontoInstant(newDate, newEnd) : null,
    notifyChannels: channels,
    actorClerkId: session.userId,
  });
  revalidatePath(`/programs/general/${programId}`);
}
