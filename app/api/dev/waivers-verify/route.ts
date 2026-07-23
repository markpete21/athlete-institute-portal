import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { addRentalLine, createRental } from '@/lib/rentals/quotes';
import { upsertRate } from '@/lib/rentals/rates';
import { markRentalBooked } from '@/lib/rentals/payments';
import { attachWaiverToRental, createWaiver, isWaiverSatisfied, signWaiver, signatureFor, updateWaiver } from '@/lib/waivers';

/**
 * DEV-ONLY: Stage-5 waivers - versioning, e-sign, and the confirm-gate
 * (unsigned waiver BLOCKS mark-booked; signing unblocks; a body edit bumps the
 * version and re-blocks until re-signed). Cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  let rentalId: number | null = null;
  let waiverId: number | null = null;
  const day = '2026-11-17';

  try {
    const { data: fac } = await db.from('facilities').select('id, name').is('deleted_at', null);
    const court = fac!.find((f) => f.name === 'Dome Court 1')!.id;
    await upsertRate({ facility_id: court, hourly_cents: 10000, full_day_cents: null, flat_cents: null }, 'system:verify');

    const waiver = await createWaiver({ name: `Verify Waiver ${Date.now()}`, body: 'Original terms v1.' }, 'system:verify');
    waiverId = waiver.id;
    record('waiver created at v1', waiver.version === 1, `v${waiver.version}`);

    const rental = await createRental({ title: 'Waiver Verify', contactEmail: 'w@example.test', actorClerkId: 'system:verify' });
    rentalId = rental.id;
    await addRentalLine({ rentalId: rental.id, facilityId: court, rateMode: 'hourly', startsAt: `${day}T18:00:00-05:00`, endsAt: `${day}T20:00:00-05:00`, actorClerkId: 'system:verify' });
    await attachWaiverToRental(rental.id, waiver.id, 'system:verify');

    // 1. unsigned waiver blocks mark-booked
    let blocked = false;
    try { await markRentalBooked(rental.id, 'system:verify'); } catch (e) { blocked = e instanceof Error && e.message.includes('waiver'); }
    record('unsigned waiver blocks booking', blocked && !(await isWaiverSatisfied('rental', rental.id, waiver.id)), `blocked=${blocked}`);

    // 2. sign -> satisfied -> booking allowed
    await signWaiver({ waiverId: waiver.id, entityType: 'rental', entityId: rental.id, signerName: 'Jordan Renter', signatureText: 'Jordan Renter' });
    const satisfied = await isWaiverSatisfied('rental', rental.id, waiver.id);
    const sig = await signatureFor('rental', rental.id, waiver.id);
    record('signed at current version -> satisfied', satisfied && sig?.waiver_version === 1, `sig v${sig?.waiver_version}`);

    const booked = await markRentalBooked(rental.id, 'system:verify');
    record('signed waiver allows booking', booked.status === 'deposit_due', booked.status);

    // 3. body edit bumps version -> prior signature no longer satisfies
    await updateWaiver(waiver.id, { body: 'Amended terms v2.' }, 'system:verify');
    const stillOk = await isWaiverSatisfied('rental', rental.id, waiver.id);
    record('body edit bumps version, old signature stale', !stillOk, `satisfied after edit=${stillOk}`);

    // 4. metadata-only edit does NOT bump version
    await updateWaiver(waiver.id, { name: 'Renamed only' }, 'system:verify');
    const { data: wrow } = await db.from('waivers').select('version').eq('id', waiver.id).single();
    record('metadata edit keeps version', wrow!.version === 2, `v${wrow!.version}`);

    // 5. no waiver attached -> gate passes
    record('no waiver -> gate satisfied', await isWaiverSatisfied('rental', rental.id, null), 'ok');
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (rentalId) {
      const { data: lines } = await db.from('rental_lines').select('booking_id').eq('rental_id', rentalId);
      const ids = (lines ?? []).map((l) => l.booking_id).filter(Boolean) as number[];
      await db.from('waiver_signatures').delete().eq('entity_type', 'rental').eq('entity_id', rentalId);
      if (ids.length) await db.from('bookings').delete().in('id', ids);
      await db.from('rentals').delete().eq('id', rentalId);
    }
    if (waiverId) await db.from('waivers').delete().eq('id', waiverId);
    await db.from('facility_rates').delete().gte('facility_id', 0);
    record('cleanup', true, 'waiver, signatures, rental removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
