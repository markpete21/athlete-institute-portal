import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { checkAvailability } from '@/lib/bookings';
import { upsertRate } from '@/lib/rentals/rates';
import {
  addonTotalCents,
  addRentalAddon,
  addRentalLine,
  createRental,
  getRentalByToken,
  lineTotalCents,
  removeRentalLine,
  rollup,
} from '@/lib/rentals/quotes';

/**
 * DEV-ONLY: Stage-2 quote builder end to end - pure math (line totals, addon
 * modes, roll-up w/ HST + deposit), live build (lines hold slots as tentative
 * bookings, facility-attached per-hour addon uses line hours), public token
 * page over HTTP, line removal cancels its booking. Cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  let rentalId: number | null = null;
  const day = '2026-10-05';
  const iso = (h: number, m = 0) => `${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-04:00`;

  try {
    // 0. pure math
    record(
      'pure: line totals (hourly fractional, flat)',
      lineTotalCents('hourly', 8000, iso(18), iso(20, 30)) === 20000 && lineTotalCents('flat', 50000, iso(9), iso(17)) === 50000,
      'hourly 2.5h x $80 = $200; flat = $500',
    );
    record(
      'pure: addon modes',
      addonTotalCents('flat', 25000, 3, null) === 25000 &&
        addonTotalCents('per_unit', 3500, 4, null) === 14000 &&
        addonTotalCents('per_hour', 3500, 1, 2.5) === 8750,
      'flat ignores qty; per-unit x4; per-hour x line 2.5h',
    );
    const r = rollup([{ line_total_cents: 20000 }, { line_total_cents: 50000 }], [{ total_cents: 8750 }], 25, false);
    record(
      'pure: roll-up subtotal->HST->deposit->balance',
      r.subtotal_cents === 78750 && r.tax_cents === 10238 && r.total_cents === 88988 && r.deposit_cents === 22247 && r.balance_cents === 66741,
      JSON.stringify(r),
    );
    const internal = rollup([{ line_total_cents: 20000 }], [], 25, true);
    record('pure: internal rentals are $0', internal.total_cents === 0 && internal.deposit_cents === 0, JSON.stringify(internal));

    // live build against the real tree
    const { data: fac } = await db.from('facilities').select('id, name').is('deleted_at', null);
    const idOf = (name: string) => fac!.find((f) => f.name === name)!.id;
    await upsertRate({ facility_id: idOf('Dome'), hourly_cents: 8000, full_day_cents: 150000, flat_cents: null }, 'system:verify');

    const rental = await createRental({
      title: 'Verify Tournament', contactName: 'Quote Verify', contactEmail: 'quote@example.test',
      bookingType: 'tournament', actorClerkId: 'system:verify',
    });
    rentalId = rental.id;

    // 1. two blocks; each creates a TENTATIVE slot-holding booking
    const l1 = await addRentalLine({ rentalId, facilityId: idOf('Dome Court 1'), rateMode: 'hourly', startsAt: iso(9), endsAt: iso(11, 30), actorClerkId: 'system:verify' });
    const l2 = await addRentalLine({ rentalId, facilityId: idOf('Dome Court 2'), rateMode: 'full_day', startsAt: iso(9), endsAt: iso(17), actorClerkId: 'system:verify' });
    record(
      'lines: inherited rates + totals (hourly 2.5h, full-day)',
      l1.line.line_total_cents === 20000 && l1.line.unit_rate_cents === 8000 && l2.line.line_total_cents === 150000,
      `line1 ${l1.line.line_total_cents}, line2 ${l2.line.line_total_cents}`,
    );
    const hold = await checkAvailability({ facilityId: idOf('Dome Court 1'), startsAt: iso(10), endsAt: iso(12) });
    record(
      'quote holds the slot (tentative booking)',
      !hold.available && hold.conflicts[0].booking.status === 'tentative',
      `conflicts=${hold.conflicts.length}`,
    );

    // 2. addons: per-hour attached to line 1 (2.5h), flat global
    const { data: cat } = await db.from('rental_addons_catalog').select('id, name').order('name');
    const staffAddon = cat!.find((a) => a.name === 'Extra staff')!.id;   // per_hour 3500
    const streamAddon = cat!.find((a) => a.name === 'Live stream')!.id;  // flat 25000
    const a1 = await addRentalAddon({ rentalId, addonId: staffAddon, lineId: l1.line.id, actorClerkId: 'system:verify' });
    const a2 = await addRentalAddon({ rentalId, addonId: streamAddon, actorClerkId: 'system:verify' });
    record(
      'addons: line-attached per-hour uses line hours; flat global',
      a1.total_cents === 8750 && a1.line_id === l1.line.id && a2.total_cents === 25000 && a2.line_id === null,
      `staff ${a1.total_cents} (2.5h x $35), stream ${a2.total_cents}`,
    );

    // 3. cached roll-up on the rental row
    const { data: row } = await db.from('rentals').select('subtotal_cents, tax_cents, total_cents, deposit_cents').eq('id', rentalId).single();
    const expectSub = 20000 + 150000 + 8750 + 25000;
    // Assert INVARIANTS, not a re-derivation (subtotal*1.13 float-diverges from
    // the code's subtotal + round(subtotal*0.13)).
    record(
      'roll-up persisted on rental (internally consistent)',
      row!.subtotal_cents === expectSub &&
        row!.tax_cents === Math.round(expectSub * 0.13) &&
        row!.total_cents === row!.subtotal_cents + row!.tax_cents &&
        row!.deposit_cents === Math.round(row!.total_cents * 0.25),
      JSON.stringify(row),
    );

    // 4. public quote page over HTTP (unauthenticated)
    const res = await fetch(`http://localhost:3101/quote/${rental.quote_token}`, { headers: { Host: 'play.athleteinstitute.ca' }, cache: 'no-store' });
    const html = await res.text();
    record(
      'online quote link renders',
      res.status === 200 && html.includes('Verify Tournament') && html.includes('Dome Court 1') && html.includes('Extra staff'),
      `HTTP ${res.status}`,
    );
    const tokenRental = await getRentalByToken(rental.quote_token);
    record('token lookup hydrates lines + addons', tokenRental!.lines.length === 2 && tokenRental!.addons.length === 2, 'ok');

    // 5. removing a line cancels its booking and re-rolls totals
    await removeRentalLine(l1.line.id, 'system:verify');
    const freed = await checkAvailability({ facilityId: idOf('Dome Court 1'), startsAt: iso(10), endsAt: iso(12) });
    const { data: after } = await db.from('rentals').select('subtotal_cents').eq('id', rentalId).single();
    record(
      'line removal frees slot + re-rolls (line addon gone too)',
      freed.available && after!.subtotal_cents === 150000 + 25000,
      `subtotal now ${after!.subtotal_cents}`,
    );
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (rentalId) {
      const { data: lines } = await db.from('rental_lines').select('booking_id').eq('rental_id', rentalId);
      const bookingIds = (lines ?? []).map((l) => l.booking_id).filter(Boolean) as number[];
      if (bookingIds.length) await db.from('bookings').delete().in('id', bookingIds);
      await db.from('rentals').delete().eq('id', rentalId);
    }
    await db.from('facility_rates').delete().gte('facility_id', 0);
    record('cleanup', true, 'rental, bookings, rates removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
