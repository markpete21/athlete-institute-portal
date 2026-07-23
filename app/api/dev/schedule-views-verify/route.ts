import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createBooking, type BookingRecord } from '@/lib/bookings';
import { bookingsByDate, filterBookings, ganttForDay, torontoDateOf } from '@/lib/schedule-views';
import type { FacilityNode } from '@ai/foundation';

/**
 * DEV-ONLY: Stage-5 view shaping against the live tree - Gantt parent/child
 * rows with descendant rollup + (whole) rows, bar fractions, tree-aware
 * filters, month grouping. Cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const made: number[] = [];
  const day = '2026-09-29';
  const iso = (h: number) => `${day}T${String(h).padStart(2, '0')}:00:00-04:00`;

  try {
    const { data: facRows } = await db
      .from('facilities')
      .select('id, parent_id, name, label, sort_order, bookable, deleted_at')
      .is('deleted_at', null);
    const tree = (facRows ?? []) as FacilityNode[];
    const idOf = (name: string) => tree.find((f) => f.name === name)!.id;
    const dome = idOf('Dome');
    const fieldhouse = idOf('Fieldhouse');
    const court1 = idOf('Dome Court 1');
    const basketA = idOf('Court 1 - East Basket');

    // Bookings: one on a basket (should roll up to Court 1's row), one on the
    // whole Dome, one rental on Fieldhouse Gym.
    const b1 = await createBooking({ facilityId: basketA, startsAt: iso(9), endsAt: iso(11), source: 'program', title: 'Skills', actorClerkId: 'system:verify' });
    const b2 = await createBooking({ facilityId: dome, startsAt: iso(19), endsAt: iso(21), source: 'event', title: 'Showcase', actorClerkId: 'system:verify' });
    const b3 = await createBooking({ facilityId: idOf('Fieldhouse Gym'), startsAt: iso(15), endsAt: iso(23), source: 'rental', title: 'Org Rental', actorClerkId: 'system:verify' });
    made.push(b1.booking.id, b2.booking.id, b3.booking.id);
    const bookings = [b1.booking, b2.booking, b3.booking] as BookingRecord[];

    // 1. Gantt rows: parent/child columns, basket rolls up to Court 1 row
    const rows = ganttForDay(tree, bookings, day, [dome, fieldhouse], new Set([b1.booking.id]));
    const court1Row = rows.find((r) => r.child === 'Dome Court 1');
    const wholeRow = rows.find((r) => r.parent === 'Dome' && r.child === '(whole)');
    record(
      'rollup: basket booking appears on its court row',
      !!court1Row && court1Row.bars.length === 1 && court1Row.bars[0].title === 'Skills' && court1Row.bars[0].conflicted,
      `Court 1 bars=${court1Row?.bars.length}, conflicted flag=${court1Row?.bars[0]?.conflicted}`,
    );
    record(
      'whole-facility booking gets its own row',
      !!wholeRow && wholeRow.bars[0].title === 'Showcase',
      wholeRow ? `(whole) row with "${wholeRow.bars[0]?.title}"` : 'missing',
    );

    // 2. bar fractions: 9-11am on the 7-23 axis -> start=(9-7)/16=0.125, end=0.25
    const bar = court1Row!.bars[0];
    record(
      'bar fractions on the day axis',
      Math.abs(bar.start - 0.125) < 1e-9 && Math.abs(bar.end - 0.25) < 1e-9,
      `start=${bar.start}, end=${bar.end}`,
    );

    // 3. clamping: 15:00-23:00 rental ends exactly at 1.0
    const fhRow = rows.find((r) => r.child === 'Fieldhouse Gym');
    record('end-of-day clamps to 1.0', fhRow!.bars[0].end === 1, `end=${fhRow!.bars[0].end}`);

    // 4. tree-aware facility filter: selecting Court 1 keeps the basket booking
    //    AND the whole-Dome booking (ancestor occupies it), drops Fieldhouse
    const filtered = filterBookings(tree, bookings, { facilityIds: [court1] });
    record(
      'tree-aware filter (descendants + ancestors, drops siblings)',
      filtered.length === 2 && filtered.every((b) => ['Skills', 'Showcase'].includes(b.title)),
      filtered.map((b) => b.title).join(', '),
    );

    // 5. source/status/internal filters
    const rentalsOnly = filterBookings(tree, bookings, { source: 'rental' });
    record('source filter', rentalsOnly.length === 1 && rentalsOnly[0].title === 'Org Rental', rentalsOnly.map((b) => b.title).join(','));

    // 6. month grouping by Toronto date
    const grouped = bookingsByDate(bookings);
    record(
      'month grouping by Toronto date',
      grouped.get(day)?.length === 3 && torontoDateOf(iso(9)) === day,
      `${grouped.get(day)?.length} bookings on ${day}`,
    );
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (made.length) await db.from('bookings').delete().in('id', made);
    record('cleanup', true, `${made.length} synthetic bookings removed`);
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
