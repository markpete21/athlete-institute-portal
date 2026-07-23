import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { addRentalLine, createRental } from '@/lib/rentals/quotes';

/**
 * DEV-ONLY: Stage-3 internal path - $0 internal rental with a business unit +
 * booking type, whose line writes a CONFIRMED booking (not a tentative quote
 * hold) via the Module 2 API. Cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  let rentalId: number | null = null;
  const day = '2026-10-12';

  try {
    const { data: fac } = await db.from('facilities').select('id, name').is('deleted_at', null);
    const court = fac!.find((f) => f.name === 'Dome Court 1')!.id;
    const { data: bu } = await db.from('business_units').select('id, name').eq('name', 'OP National Boys').single();

    // internal rental w/ business unit + booking type
    const rental = await createRental({
      title: 'OP Boys Practice Block',
      isInternal: true,
      businessUnitId: bu!.id,
      bookingType: 'league',
      actorClerkId: 'system:verify',
    });
    rentalId = rental.id;
    record('internal rental carries BU + type', rental.is_internal && rental.business_unit_id === bu!.id && rental.booking_type === 'league', `BU=${rental.business_unit_id}, type=${rental.booking_type}`);

    // line: $0 and a CONFIRMED booking (internal isn't a "quote hold")
    const line = await addRentalLine({
      rentalId, facilityId: court, rateMode: 'hourly',
      startsAt: `${day}T18:00:00-04:00`, endsAt: `${day}T20:00:00-04:00`,
      actorClerkId: 'system:verify',
    });
    record('internal line priced $0', line.line.line_total_cents === 0 && line.line.unit_rate_cents === 0, `total=${line.line.line_total_cents}`);

    const { data: bk } = await db.from('bookings').select('status, is_internal, source').eq('id', line.line.booking_id!).single();
    record('internal booking is CONFIRMED + internal (not a tentative hold)', bk!.status === 'confirmed' && bk!.is_internal && bk!.source === 'rental', JSON.stringify(bk));

    // rental totals stay $0
    const { data: row } = await db.from('rentals').select('total_cents, deposit_cents').eq('id', rentalId).single();
    record('internal rental total $0', row!.total_cents === 0 && row!.deposit_cents === 0, JSON.stringify(row));
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (rentalId) {
      const { data: lines } = await db.from('rental_lines').select('booking_id').eq('rental_id', rentalId);
      const ids = (lines ?? []).map((l) => l.booking_id).filter(Boolean) as number[];
      if (ids.length) await db.from('bookings').delete().in('id', ids);
      await db.from('rentals').delete().eq('id', rentalId);
    }
    record('cleanup', true, 'internal rental removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
