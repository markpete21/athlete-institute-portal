import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { addRecurringRentalLines, createRental, getRental } from '@/lib/rentals/quotes';
import { upsertRate } from '@/lib/rentals/rates';
import { markRentalBooked } from '@/lib/rentals/payments';
import { checkAvailability, createBooking } from '@/lib/bookings';

/**
 * DEV-ONLY: Stage 6 (recurring rentals under one agreement) + Stage 7 (org
 * rental carries an org + requires the same deposit path). Cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const rentalIds: number[] = [];
  const blockerIds: number[] = [];
  let orgId: number | null = null;

  try {
    const { data: fac } = await db.from('facilities').select('id, name').is('deleted_at', null);
    const court = fac!.find((f) => f.name === 'Dome Court 3')!.id;
    await upsertRate({ facility_id: court, hourly_cents: 12000, full_day_cents: null, flat_cents: null }, 'system:verify');

    // Pre-block one Tuesday (Dec 8) to prove single-instance conflict isolation.
    const blocker = await createBooking({ facilityId: court, startsAt: '2026-12-08T18:30:00-05:00', endsAt: '2026-12-08T19:30:00-05:00', source: 'internal', title: 'Pre-block', actorClerkId: 'system:verify' });
    blockerIds.push(blocker.booking.id);

    // Stage 6: recurring rental - Tuesdays 6-8pm, Dec 1 -> Dec 22 (4 dates) under one rental
    const rec = await createRental({ title: 'Winter League Rental', contactEmail: 'league@example.test', actorClerkId: 'system:verify' });
    rentalIds.push(rec.id);
    const series = await addRecurringRentalLines({
      rentalId: rec.id, facilityId: court, rateMode: 'hourly',
      pattern: { freq: 'weekly', byWeekday: [2] },
      startDate: '2026-12-01', startTime: '18:00', endTime: '20:00', until: '2026-12-22',
      actorClerkId: 'system:verify',
    });
    record('recurring: 4 dates under one agreement', series.lineCount === 4, `${series.lineCount} lines`);

    const full = await getRental(rec.id);
    const seriesIds = new Set(full!.lines.map((l) => l.series_id).filter(Boolean));
    record('all lines share one series', seriesIds.size === 1 && full!.lines.length === 4, `series count ${seriesIds.size}`);
    record('roll-up spans all dates (4 × 2h × $120)', full!.subtotal_cents === 4 * 2 * 12000, `subtotal ${full!.subtotal_cents}`);

    // single-instance conflict: only Dec 8 collides
    record('single-date conflict isolated', series.conflictedDates.length === 1 && series.conflictedDates[0] === '2026-12-08', JSON.stringify(series.conflictedDates));

    // Stage 7: org rental carries organization_id + same deposit path
    const { data: org } = await db.from('organizations').insert({ clerk_org_id: `org_verify_${Date.now()}`, name: 'Verify Org' }).select('id').single();
    orgId = org!.id;
    const orgRental = await createRental({ title: 'Org Tournament', organizationId: orgId, contactEmail: 'org@example.test', actorClerkId: 'system:verify' });
    rentalIds.push(orgRental.id);
    const { addRentalLine } = await import('@/lib/rentals/quotes');
    await addRentalLine({ rentalId: orgRental.id, facilityId: court, rateMode: 'hourly', startsAt: '2026-12-05T09:00:00-05:00', endsAt: '2026-12-05T17:00:00-05:00', actorClerkId: 'system:verify' });
    const booked = await markRentalBooked(orgRental.id, 'system:verify');
    const { data: orgRow } = await db.from('rentals').select('organization_id, deposit_cents, status').eq('id', orgRental.id).single();
    record(
      'org rental: linked to org, deposit required, same booked path',
      orgRow!.organization_id === orgId && orgRow!.deposit_cents > 0 && booked.status === 'deposit_due',
      `org=${orgRow!.organization_id}, deposit=${orgRow!.deposit_cents}, status=${orgRow!.status}`,
    );
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    for (const rid of rentalIds) {
      const { data: lines } = await db.from('rental_lines').select('booking_id, series_id').eq('rental_id', rid);
      const ids = (lines ?? []).map((l) => l.booking_id).filter(Boolean) as number[];
      const sids = [...new Set((lines ?? []).map((l) => l.series_id).filter(Boolean))] as number[];
      if (ids.length) await db.from('bookings').delete().in('id', ids);
      await db.from('rentals').delete().eq('id', rid);
      if (sids.length) await db.from('booking_series').delete().in('id', sids);
    }
    if (blockerIds.length) await db.from('bookings').delete().in('id', blockerIds);
    if (orgId) await db.from('organizations').delete().eq('id', orgId);
    await db.from('facility_rates').delete().gte('facility_id', 0);
    record('cleanup', true, 'rentals, bookings, series, org removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
