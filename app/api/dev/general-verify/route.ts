import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';
import { listSessions, purchaseSessions } from '@/lib/programs/dropin';
import { listRescheduleableSessions, rescheduleSession } from '@/lib/programs/reschedule';
import { createBooking } from '@/lib/bookings';

/**
 * DEV-ONLY: Module 10 - drop-in per-session capacity + full-date lockout,
 * buy-more-later stays ONE registration, and the shared reschedule workflow
 * (move w/ conflict check + postpone-to-TBD). Cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  let programId: number | null = null;
  let famId: number | null = null;
  let tempFacilityId: number | null = null;
  const bookingIds: number[] = [];

  try {
    const gen = (await listProgramTypes()).find((t) => t.key === 'dropin') ?? (await listProgramTypes()).find((t) => t.key === 'clinic')!;
    const prog = await createProgram({ name: 'Verify Open Gym', programTypeId: gen.id, actorClerkId: 'system:verify' });
    programId = prog.id;
    await db.from('programs').update({ status: 'registration_open', tags: ['player_id'] }).eq('id', prog.id);

    // Drop-in sessions: S1 unlimited, S2 capacity 1.
    const { data: s1 } = await db.from('dropin_sessions').insert({ program_id: prog.id, session_date: '2026-07-28', starts_at: '2026-07-28T22:00:00Z', ends_at: '2026-07-28T23:00:00Z', price_cents: 1500 }).select('id').single();
    const { data: s2 } = await db.from('dropin_sessions').insert({ program_id: prog.id, session_date: '2026-07-29', starts_at: '2026-07-29T22:00:00Z', ends_at: '2026-07-29T23:00:00Z', price_cents: 1500, capacity: 1 }).select('id').single();
    const { data: s3 } = await db.from('dropin_sessions').insert({ program_id: prog.id, session_date: '2026-07-30', starts_at: '2026-07-30T22:00:00Z', ends_at: '2026-07-30T23:00:00Z', price_cents: 1500 }).select('id').single();

    const { data: fam } = await db.from('families').insert({ name: 'DropIn Fam' }).select('id').single();
    famId = fam!.id;
    const mem = async (n: string) => (await db.from('family_members').insert({ family_id: fam!.id, first_name: n, last_name: 'K', member_role: 'dependent' }).select('id').single()).data!.id;
    const kidA = await mem('A');
    const kidB = await mem('B');

    // 1. multi-select purchase (S1 + S2), priced per session
    const p1 = await purchaseSessions({ programId: prog.id, familyMemberId: kidA, familyId: fam!.id, sessionIds: [s1!.id, s2!.id], actorClerkId: 'system:verify' });
    record('drop-in multi-select purchase (per-session price)', p1.purchasedSessionIds.length === 2 && p1.totalCents === 3000, `${p1.purchasedSessionIds.length} sessions, $${p1.totalCents / 100}`);

    // 2. per-session capacity: S2 (cap 1) now full -> greyed out + purchase rejected
    const list = await listSessions(prog.id);
    const s2view = list.find((s) => s.id === s2!.id)!;
    record('full date greyed out (capacity lockout)', s2view.full && s2view.spots_left === 0, JSON.stringify({ full: s2view.full, left: s2view.spots_left }));
    let rejected = false;
    try { await purchaseSessions({ programId: prog.id, familyMemberId: kidB, familyId: fam!.id, sessionIds: [s2!.id], actorClerkId: 'system:verify' }); } catch { rejected = true; }
    record('over-capacity session purchase rejected', rejected, rejected ? 'rejected' : 'allowed');

    // 3. buy-more-later keeps ONE registration
    const p2 = await purchaseSessions({ programId: prog.id, familyMemberId: kidA, familyId: fam!.id, sessionIds: [s3!.id], actorClerkId: 'system:verify' });
    const sameReg = p2.registrationId === p1.registrationId;
    const { count: regCount } = await db.from('registrations').select('id', { count: 'exact', head: true }).eq('program_id', prog.id).eq('family_member_id', kidA);
    record('buy-more-later stays one registration', sameReg && regCount === 1, `reg ${p2.registrationId} == ${p1.registrationId}, count ${regCount}`);

    // --- reschedule workflow (framework program_sessions + bookings) ---
    let { data: facility } = await db.from('facilities').select('id').eq('bookable', true).is('deleted_at', null).limit(1).maybeSingle();
    if (!facility) {
      const { data: f } = await db.from('facilities').insert({ name: 'Verify Court', bookable: true }).select('id').single();
      tempFacilityId = f!.id; facility = f!;
    }
    // Session A booking (to be moved), plus a blocker occupying the target slot.
    const bA = await createBooking({ facilityId: facility.id, startsAt: '2026-08-03T22:00:00Z', endsAt: '2026-08-03T23:00:00Z', source: 'program', title: 'Session A', actorClerkId: 'system:verify' });
    bookingIds.push(bA.booking.id);
    const blocker = await createBooking({ facilityId: facility.id, startsAt: '2026-08-04T22:00:00Z', endsAt: '2026-08-04T23:00:00Z', source: 'program', title: 'Blocker', actorClerkId: 'system:verify' });
    bookingIds.push(blocker.booking.id);
    const { data: psA } = await db.from('program_sessions').insert({ program_id: prog.id, booking_id: bA.booking.id, starts_at: '2026-08-03T22:00:00Z', ends_at: '2026-08-03T23:00:00Z' }).select('id').single();

    const canList = await listRescheduleableSessions(prog.id);
    record('reschedule list includes framework session', canList.some((s) => s.id === psA!.id && s.kind === 'program'), `${canList.length} sessions`);

    // 4a. conflict check: moving onto the blocker's slot is refused, no change
    const conflict = await rescheduleSession({ programId: prog.id, sessionId: psA!.id, kind: 'program', newStartsAt: '2026-08-04T22:00:00Z', newEndsAt: '2026-08-04T23:00:00Z', actorClerkId: 'system:verify' });
    record('reschedule conflict check blocks move', conflict.conflict && !conflict.moved, JSON.stringify({ conflict: conflict.conflict, moved: conflict.moved }));

    // 4b. move to a free slot succeeds (session + booking follow), notify selected channels only
    const moved = await rescheduleSession({ programId: prog.id, sessionId: psA!.id, kind: 'program', newStartsAt: '2026-08-05T22:00:00Z', newEndsAt: '2026-08-05T23:00:00Z', notifyChannels: ['email'], actorClerkId: 'system:verify' });
    const { data: psAfter } = await db.from('program_sessions').select('starts_at, postponed').eq('id', psA!.id).single();
    record('reschedule-with-date moves session', moved.moved && !moved.conflict && psAfter!.starts_at.startsWith('2026-08-05') && !psAfter!.postponed && moved.channels.length === 1, JSON.stringify({ moved: moved.moved, starts: psAfter!.starts_at, ch: moved.channels }));

    // 4c. postpone (no new date) -> TBD state, booking released
    const post = await rescheduleSession({ programId: prog.id, sessionId: psA!.id, kind: 'program', actorClerkId: 'system:verify' });
    const { data: psTbd } = await db.from('program_sessions').select('postponed, booking_id').eq('id', psA!.id).single();
    const { data: relBooking } = await db.from('bookings').select('canceled_at').eq('id', bA.booking.id).single();
    record('reschedule-without-date sets TBD + releases booking', !post.moved && psTbd!.postponed && psTbd!.booking_id === null && !!relBooking!.canceled_at, JSON.stringify({ tbd: psTbd!.postponed, booking: psTbd!.booking_id }));
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (programId) {
      await db.from('dropin_purchases').delete().in('session_id', (await db.from('dropin_sessions').select('id').eq('program_id', programId)).data?.map((r) => r.id) ?? [-1]);
      await db.from('dropin_sessions').delete().eq('program_id', programId);
      await db.from('program_sessions').delete().eq('program_id', programId);
      await db.from('registrations').delete().eq('program_id', programId);
      await db.from('programs').delete().eq('id', programId);
    }
    if (bookingIds.length) await db.from('bookings').delete().in('id', bookingIds);
    if (tempFacilityId) await db.from('facilities').delete().eq('id', tempFacilityId);
    if (famId) await db.from('families').delete().eq('id', famId);
    record('cleanup', true, 'program, sessions, bookings, family removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
