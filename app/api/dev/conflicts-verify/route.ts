import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createBooking } from '@/lib/bookings';
import { findConflictPairs, keepBoth, processConflictReminders, resolveByCancel } from '@/lib/conflicts';

/**
 * DEV-ONLY: Stage-3 conflict resolution end to end - queue detection (same
 * node + tree line), confirmed-vs-quote hint, keep-both ack (pair leaves the
 * queue) + due reminder processing, override-and-delete. Cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const made: number[] = [];
  const day = '2026-09-22';
  const iso = (h: number) => `${day}T${String(h).padStart(2, '0')}:00:00-04:00`;
  const win = { from: `${day}T00:00:00Z`, to: `${day}T23:59:59Z` };

  try {
    const { data: fac } = await db.from('facilities').select('id, name').is('deleted_at', null);
    const idOf = (name: string) => fac!.find((f) => f.name === name)!.id;
    const court2 = idOf('Dome Court 2');
    const basketC = idOf('Court 2 - East Basket');

    // 1. same-node collision: confirmed program vs tentative rental quote
    const prog = await createBooking({ facilityId: court2, startsAt: iso(18), endsAt: iso(20), source: 'program', title: 'U14 League Night', actorClerkId: 'system:verify' });
    made.push(prog.booking.id);
    const quote = await createBooking({ facilityId: court2, startsAt: iso(19), endsAt: iso(21), source: 'rental', status: 'tentative', title: 'Birthday Rental Quote', actorClerkId: 'system:verify' });
    made.push(quote.booking.id);
    record('collision created without blocking (quote holds)', quote.conflicts.length === 1, `insert returned ${quote.conflicts.length} conflict`);

    // 2. tree-line collision: basket under the same court
    const basket = await createBooking({ facilityId: basketC, startsAt: iso(19), endsAt: iso(20), source: 'internal', title: 'Private Lesson', actorClerkId: 'system:verify' });
    made.push(basket.booking.id);

    // 3. queue: expect 3 pairs (prog×quote same-node, prog×basket? prog is court2, basket is child -> tree-line; quote×basket tree-line)
    const pairs = await findConflictPairs(win.from, win.to);
    const pq = pairs.find((p) => [p.a.id, p.b.id].sort().join() === [prog.booking.id, quote.booking.id].sort().join());
    record('queue detects same-node + tree-line pairs', pairs.length === 3 && !!pq, `${pairs.length} pairs`);

    // 4. confirmed-vs-quote hint favors the confirmed program
    record('hint recommends the confirmed side', !!pq?.hint && pq.hint.includes('U14 League Night'), pq?.hint ?? 'no hint');

    // 5. keep both -> pair leaves the queue; ack row scheduled
    await keepBoth(prog.booking.id, quote.booking.id, 'system:verify', { remindInHours: -1, note: 'verify' }); // already due
    const afterAck = await findConflictPairs(win.from, win.to);
    record('keep-both removes pair from queue', afterAck.length === 2, `${afterAck.length} pairs remain`);

    // 6. due reminder processed (email skips keyless; reminded_at set either way)
    const reminders = await processConflictReminders('ops@example.test');
    const { data: ack } = await db
      .from('booking_conflict_acks')
      .select('reminded_at')
      .eq('booking_a', Math.min(prog.booking.id, quote.booking.id))
      .eq('booking_b', Math.max(prog.booking.id, quote.booking.id))
      .single();
    record('due keep-both reminder processed', !!ack?.reminded_at && reminders.sent + reminders.skipped >= 1, JSON.stringify(reminders));

    // 7. override & delete: cancel the lesson -> its pairs vanish
    await resolveByCancel(basket.booking.id, 'system:verify');
    const afterCancel = await findConflictPairs(win.from, win.to);
    record('override-and-delete clears its pairs', afterCancel.length === 0, `${afterCancel.length} pairs remain`);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (made.length) await db.from('bookings').delete().in('id', made); // acks cascade
    record('cleanup', true, `${made.length} synthetic bookings removed`);
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
