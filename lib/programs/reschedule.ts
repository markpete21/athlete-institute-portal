import 'server-only';
import { audit, torontoLabel } from '@ai/foundation';
import { notify, type NotifyChannel } from '@ai/foundation/notify';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { cancelBooking, updateBooking } from '@/lib/bookings';

/**
 * Shared Reschedule Workflow (Module 4 framework capability, surfaced by
 * Module 10). Callable for ANY program type - clinics, pickup, drop-in,
 * leagues, camps, academy. Two paths, both purely scheduling + notification
 * (no money impact; any credit is handled manually via the refund engine):
 *
 *   1. with a new date  -> the Module 2 booking MOVES (conflict-checked).
 *   2. without a new date -> the session is marked "to be rescheduled" (TBD),
 *      its booking released. Staff set the real date later.
 *
 * All registrants are notified across email / text / push (Module 0 notify()).
 * All three channels default ON; callers can turn specific channels off.
 */

export type SessionKind = 'program' | 'dropin';

export interface RescheduleableSession {
  id: number;
  kind: SessionKind;
  booking_id: number | null;
  starts_at: string;
  ends_at: string;
  postponed: boolean;
  label: string;
}

const TABLE: Record<SessionKind, string> = { program: 'program_sessions', dropin: 'dropin_sessions' };

/** Sessions of a program that can be rescheduled (both framework + drop-in). */
export async function listRescheduleableSessions(programId: number): Promise<RescheduleableSession[]> {
  const db = supabaseAdmin();
  const out: RescheduleableSession[] = [];
  for (const kind of ['program', 'dropin'] as SessionKind[]) {
    const { data } = await db
      .from(TABLE[kind])
      .select('id, booking_id, starts_at, ends_at, postponed')
      .eq('program_id', programId)
      .order('starts_at');
    for (const s of data ?? []) out.push({ ...s, kind, label: torontoLabel(s.starts_at) });
  }
  return out.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/** Recipients = the head-of-household contact for every registrant in a program. */
async function programRecipients(programId: number): Promise<Array<{ email?: string | null; phone?: string | null }>> {
  const db = supabaseAdmin();
  const { data: regs } = await db
    .from('registrations')
    .select('family_id')
    .eq('program_id', programId)
    .in('status', ['active', 'waitlisted']);
  const familyIds = [...new Set((regs ?? []).map((r) => r.family_id).filter((x): x is number => x != null))];
  if (familyIds.length === 0) return [];

  const { data: fams } = await db.from('families').select('hoh_profile_id').in('id', familyIds);
  const profileIds = [...new Set((fams ?? []).map((f) => f.hoh_profile_id).filter((x): x is number => x != null))];
  if (profileIds.length === 0) return [];

  const { data: profiles } = await db.from('profiles').select('email, phone').in('id', profileIds);
  return (profiles ?? []).map((p) => ({ email: p.email, phone: p.phone }));
}

export interface RescheduleResult {
  moved: boolean;
  notified: number;
  channels: NotifyChannel[];
  conflict: boolean;
}

/**
 * Reschedule one session. Pass newStartsAt/newEndsAt to MOVE it (Module 2
 * conflict check runs; a conflict aborts with no change). Omit them to mark it
 * TBD (booking released, session flagged postponed). notifyChannels default to
 * all three; pass a subset to silence channels for this reschedule.
 */
export async function rescheduleSession(input: {
  programId: number;
  sessionId: number;
  kind: SessionKind;
  newStartsAt?: string | null;
  newEndsAt?: string | null;
  notifyChannels?: NotifyChannel[];
  actorClerkId: string;
}): Promise<RescheduleResult> {
  const db = supabaseAdmin();
  const channels = input.notifyChannels ?? ['email', 'sms', 'push'];
  const { data: session, error } = await db
    .from(TABLE[input.kind])
    .select('id, booking_id, starts_at, ends_at')
    .eq('id', input.sessionId)
    .eq('program_id', input.programId)
    .single();
  if (error) throw new Error(`session not found: ${error.message}`);

  const oldLabel = torontoLabel(session.starts_at);
  const moving = !!(input.newStartsAt && input.newEndsAt);
  let newLabel: string | null = null;

  if (moving) {
    // Move the Module 2 booking - conflict check runs on the new slot.
    if (session.booking_id) {
      const report = await updateBooking(session.booking_id, { startsAt: input.newStartsAt!, endsAt: input.newEndsAt! }, input.actorClerkId);
      if (!report.available) {
        return { moved: false, notified: 0, channels, conflict: true };
      }
    }
    await db.from(TABLE[input.kind]).update({ starts_at: input.newStartsAt, ends_at: input.newEndsAt, postponed: false }).eq('id', session.id);
    newLabel = torontoLabel(input.newStartsAt!);
  } else {
    // TBD: release the booking, flag the session postponed. Staff set date later.
    if (session.booking_id) await cancelBooking(session.booking_id, input.actorClerkId, 'reschedule: to be rescheduled');
    await db.from(TABLE[input.kind]).update({ postponed: true, booking_id: null }).eq('id', session.id);
  }

  const { data: program } = await db.from('programs').select('name').eq('id', input.programId).single();
  const recipients = await programRecipients(input.programId);
  const detailsUrl = `${process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca'}/account`;
  let notified = 0;
  for (const to of recipients) {
    const res = await notify({
      to,
      channels,
      template: 'session.rescheduled',
      data: { programName: program?.name ?? 'your program', oldLabel, newLabel, detailsUrl },
    });
    if (res.results.some((r) => r.status === 'sent')) notified += 1;
  }

  await audit({
    actorId: input.actorClerkId,
    action: moving ? 'session.rescheduled' : 'session.postponed',
    target: `${input.kind}-session:${session.id}`,
    meta: { program: input.programId, newLabel, channels, recipients: recipients.length },
  });
  return { moved: moving, notified, channels, conflict: false };
}
