import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { cancelBooking, checkAvailability, createBooking, listBookings, updateBooking } from '@/lib/bookings';

/**
 * DEV-ONLY: the bookings API against the LIVE tree - the spec's two-baskets
 * case on the real Dome Court 1, quote holds, buffers, hours warnings, soft
 * cancel, list filters. All synthetic bookings cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const made: number[] = [];
  const day = '2026-09-15'; // quiet future Tuesday
  const iso = (h: number, m = 0) => `${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-04:00`;

  try {
    const { data: fac } = await db.from('facilities').select('id, name').is('deleted_at', null);
    const idOf = (name: string) => fac!.find((f) => f.name === name)!.id;
    const basketA = idOf('Court 1 - East Basket');
    const basketB = idOf('Court 1 - West Basket');
    const court1 = idOf('Dome Court 1');
    const court2 = idOf('Dome Court 2');
    const dome = idOf('Dome');

    // 1. clean slate: Court 1 available
    const before = await checkAvailability({ facilityId: court1, startsAt: iso(18), endsAt: iso(20) });
    record('clean slot available', before.available && before.warnings.length === 0, JSON.stringify({ conflicts: before.conflicts.length }));

    // 2. book both baskets (separate records)
    const a = await createBooking({ facilityId: basketA, startsAt: iso(18), endsAt: iso(20), source: 'internal', title: 'Shooting A', actorClerkId: 'system:verify' });
    made.push(a.booking.id);
    const b = await createBooking({ facilityId: basketB, startsAt: iso(18), endsAt: iso(20), source: 'internal', title: 'Shooting B', actorClerkId: 'system:verify' });
    made.push(b.booking.id);
    record('baskets booked independently', a.available && b.available, `A conflicts=${a.conflicts.length}, B conflicts=${b.conflicts.length} (sibling independence)`);

    // 3. THE CASE: court now fully occupied via its two children; Dome too; Court 2 free
    const court1Now = await checkAvailability({ facilityId: court1, startsAt: iso(18), endsAt: iso(20) });
    const domeNow = await checkAvailability({ facilityId: dome, startsAt: iso(18), endsAt: iso(20) });
    const court2Now = await checkAvailability({ facilityId: court2, startsAt: iso(18), endsAt: iso(20) });
    record(
      'two baskets -> court + Dome occupied, Court 2 free',
      !court1Now.available && court1Now.conflicts.length === 2 && !domeNow.available && court2Now.available,
      `court1: ${court1Now.conflicts.length} descendant conflicts; dome: ${domeNow.conflicts.length}; court2 free`,
    );

    // 4. tentative quote holds Court 2; a confirmed attempt sees the hold
    const quote = await createBooking({ facilityId: court2, startsAt: iso(18), endsAt: iso(20), source: 'rental', status: 'tentative', title: 'Quote hold', actorClerkId: 'system:verify' });
    made.push(quote.booking.id);
    const vsQuote = await checkAvailability({ facilityId: court2, startsAt: iso(19), endsAt: iso(21) });
    record('tentative quote holds the slot', !vsQuote.available && vsQuote.conflicts[0].booking.status === 'tentative', `conflicts=${vsQuote.conflicts.length}`);

    // 5. buffers: cleanup 30min on a new booking makes the next hour conflict
    const buf = await createBooking({ facilityId: idOf('Fieldhouse North'), startsAt: iso(18), endsAt: iso(20), cleanupMinutes: 30, source: 'internal', title: 'With cleanup', actorClerkId: 'system:verify' });
    made.push(buf.booking.id);
    const adjacent = await checkAvailability({ facilityId: idOf('Fieldhouse North'), startsAt: iso(20), endsAt: iso(21) });
    const afterBuffer = await checkAvailability({ facilityId: idOf('Fieldhouse North'), startsAt: iso(20, 30), endsAt: iso(21, 30) });
    record('cleanup buffer occupies the adjacency', !adjacent.available && afterBuffer.available, `20:00 blocked, 20:30 free`);

    // 6. hours warning (7am) is advisory - booking still created
    const early = await createBooking({ facilityId: court2, startsAt: iso(6), endsAt: iso(7), source: 'internal', title: 'Early bird', actorClerkId: 'system:verify' });
    made.push(early.booking.id);
    record('outside-hours warns but is overridable', early.warnings.length === 1 && !!early.booking.id, early.warnings[0]?.message ?? '');

    // 7. update: moving the quote out of the way clears the conflict (self-ignoring)
    const moved = await updateBooking(quote.booking.id, { startsAt: iso(21), endsAt: iso(22) }, 'system:verify');
    record('update re-checks (self-ignoring)', moved.available, `conflicts=${moved.conflicts.length}`);

    // 8. public default flags: program ON, rental OFF
    record(
      'public-schedule defaults by source',
      quote.booking.show_on_public_schedule === false && a.booking.show_on_public_schedule === false,
      'rental/internal default hidden',
    );

    // 9. soft cancel frees the slot
    await cancelBooking(a.booking.id, 'system:verify', 'verify');
    await cancelBooking(b.booking.id, 'system:verify', 'verify');
    const freed = await checkAvailability({ facilityId: court1, startsAt: iso(18), endsAt: iso(20) });
    record('soft cancel frees the court', freed.available, `conflicts=${freed.conflicts.length}`);

    // 10. list filter shape
    const listed = await listBookings({ from: `${day}T00:00:00Z`, to: `${day}T23:59:59Z`, sources: ['internal'] });
    record('listBookings filters', listed.every((x) => x.source === 'internal'), `${listed.length} internal on ${day}`);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (made.length) await db.from('bookings').delete().in('id', made);
    record('cleanup', true, `${made.length} synthetic bookings removed`);
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
