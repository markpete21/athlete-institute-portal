import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { cancelBooking, createBooking, createRecurringBookings, listBookings } from '@/lib/bookings';

/**
 * DEV-ONLY: Stage-4 recurrence against the live tree - a weekly series lands
 * as individual bookings; one pre-blocked date reports its conflict alone;
 * canceling that single occurrence leaves the rest intact.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const made: number[] = [];
  let seriesId: number | null = null;

  try {
    const { data: fac } = await db.from('facilities').select('id, name').is('deleted_at', null);
    const court3 = fac!.find((f) => f.name === 'Dome Court 3')!.id;

    // 0. pre-block one Tuesday (Oct 13) on the same court
    const blocker = await createBooking({
      facilityId: court3, startsAt: '2026-10-13T18:30:00-04:00', endsAt: '2026-10-13T19:30:00-04:00',
      source: 'rental', title: 'Pre-existing rental', actorClerkId: 'system:verify',
    });
    made.push(blocker.booking.id);

    // 1. weekly Tuesdays 18:00-20:00, Sep 29 - Nov 10 (7 occurrences, crosses DST Nov 1)
    const series = await createRecurringBookings({
      facilityId: court3,
      pattern: { freq: 'weekly', byWeekday: [2] },
      startDate: '2026-09-29', startTime: '18:00', endTime: '20:00', until: '2026-11-10',
      source: 'program', title: 'U16 Practice', actorClerkId: 'system:verify',
    });
    seriesId = series.seriesId;
    made.push(...series.occurrences.map((o) => o.booking.id));
    record('series generated (7 Tuesdays)', series.occurrences.length === 7, `${series.occurrences.length} occurrences`);

    // 2. exactly the blocked date conflicts
    record(
      'single-date conflict isolated',
      series.conflictedDates.length === 1 && series.conflictedDates[0] === '2026-10-13',
      JSON.stringify(series.conflictedDates),
    );

    // 3. DST: Oct 27 (EDT) and Nov 3 (EST) both 18:00 Toronto
    const oct27 = series.occurrences.find((o) => o.date === '2026-10-27')!;
    const nov3 = series.occurrences.find((o) => o.date === '2026-11-03')!;
    record(
      'DST crossing keeps 6pm wall time',
      oct27.booking.starts_at.includes('22:00') && nov3.booking.starts_at.includes('23:00'),
      `${oct27.booking.starts_at} / ${nov3.booking.starts_at}`,
    );

    // 4. resolve JUST the conflicted date - cancel that one occurrence
    const conflicted = series.occurrences.find((o) => o.date === '2026-10-13')!;
    await cancelBooking(conflicted.booking.id, 'system:verify', 'single-instance resolution');
    const remaining = await listBookings({ from: '2026-09-28T00:00:00Z', to: '2026-11-11T00:00:00Z', facilityIds: [court3], sources: ['program'] });
    record(
      'canceling one instance leaves the series intact',
      remaining.length === 6 && remaining.every((b) => b.series_id === seriesId),
      `${remaining.length} live occurrences, series ${seriesId}`,
    );
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (made.length) await db.from('bookings').delete().in('id', made);
    if (seriesId) await db.from('booking_series').delete().eq('id', seriesId);
    record('cleanup', true, `${made.length} bookings + series removed`);
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
