import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { addRentalLine, createRental, updateRentalDetails } from '@/lib/rentals/quotes';
import { markRentalBooked } from '@/lib/rentals/payments';
import { searchInvoices, searchRentals } from '@/lib/rentals/search';

/**
 * DEV-ONLY: the rentals finder, the invoices (instalments) view and the
 * details editor, against the live tree. All synthetic rows cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const rentalIds: number[] = [];
  const day = '2026-09-17';
  const iso = (h: number) => `${day}T${String(h).padStart(2, '0')}:00:00-04:00`;
  const stamp = `ZZQ${Date.now()}`;

  try {
    const { data: fac } = await db.from('facilities').select('id, name').is('deleted_at', null);
    const court = fac!.find((f) => f.name === 'Dome Court 3')!.id;

    // A findable rental with a distinctive title + contact.
    const r = await createRental({
      title: `Lookup Verify ${stamp}`,
      contactName: 'Dana Verify',
      contactEmail: 'dana.verify@example.com',
      actorClerkId: 'system:verify',
    });
    rentalIds.push(r.id);
    await addRentalLine({
      rentalId: r.id, facilityId: court, rateMode: 'hourly',
      startsAt: iso(9), endsAt: iso(11), rateCentsOverride: 20000, actorClerkId: 'system:verify',
    });

    // 1. free-text search finds it by title
    const byTitle = await searchRentals({ q: stamp });
    record('search by title', byTitle.length === 1 && byTitle[0].id === r.id, `${byTitle.length} hit(s)`);

    // 2. by contact email
    const byEmail = await searchRentals({ q: 'dana.verify@example.com' });
    record('search by contact email', byEmail.some((x) => x.id === r.id), `${byEmail.length} hit(s)`);

    // 3. by #id
    const byId = await searchRentals({ q: `#${r.id}` });
    record('search by #id', byId.length === 1 && byId[0].id === r.id, `#${r.id}`);

    // 4. a search that matches nothing returns nothing (not everything - an
    //    ignored filter silently listing the whole table is the dangerous bug)
    const none = await searchRentals({ q: 'nonexistent-zzz-string' });
    record('no-match search returns empty', none.length === 0, `${none.length} rows`);

    // 5. status filter excludes it once we ask for a status it isn't in
    const wrongStatus = await searchRentals({ q: stamp, status: 'paid' });
    record('status filter applies', wrongStatus.length === 0, 'quote not returned as paid');

    // 6. the booked date range comes back for the results table
    const withDates = byTitle[0];
    record(
      'search row carries the booked date span',
      !!withDates.first_block && !!withDates.last_block,
      `${withDates.first_block?.slice(0, 10)} -> ${withDates.last_block?.slice(0, 10)}`,
    );

    // 7. editing details persists and re-totals when the deposit % changes
    const before = await db.from('rentals').select('deposit_cents, total_cents').eq('id', r.id).single();
    await updateRentalDetails(r.id, { contactName: 'Dana Edited', depositPct: 50 }, 'system:verify');
    const after = await db
      .from('rentals')
      .select('contact_name, deposit_pct, deposit_cents, total_cents')
      .eq('id', r.id)
      .single();
    record(
      'edit details saves + re-totals the deposit',
      after.data!.contact_name === 'Dana Edited'
        && after.data!.deposit_pct === 50
        && after.data!.deposit_cents !== before.data!.deposit_cents
        && after.data!.deposit_cents === Math.round(after.data!.total_cents * 0.5),
      `deposit ${before.data!.deposit_cents} -> ${after.data!.deposit_cents} of ${after.data!.total_cents}`,
    );

    // 8. a bad deposit % is rejected rather than stored
    let rejected = false;
    try {
      await updateRentalDetails(r.id, { depositPct: 140 }, 'system:verify');
    } catch {
      rejected = true;
    }
    record('invalid deposit % rejected', rejected, '140 refused');

    // 9. booking it raises instalments, which ARE the invoices
    await markRentalBooked(r.id, 'system:verify');
    const invoices = await searchInvoices({ q: stamp });
    record(
      'invoices view lists the instalments',
      invoices.length >= 1 && invoices.every((i) => i.rental_id === r.id),
      `${invoices.length} instalment(s): ${invoices.map((i) => i.label).join(', ')}`,
    );

    // 10. outstanding rolls up onto the rental row
    const owing = await searchRentals({ q: stamp, outstandingOnly: true });
    record(
      'outstanding-only filter + rollup',
      owing.length === 1 && owing[0].outstanding_cents > 0 && !!owing[0].next_due,
      `owes ${owing[0]?.outstanding_cents} next ${owing[0]?.next_due}`,
    );

    // 11. 'overdue' is derived (pending + past due), not a stored status
    const overdueNow = await searchInvoices({ q: stamp, status: 'overdue' });
    const futureDue = invoices.every((i) => !i.overdue);
    record(
      'overdue is derived from the due date',
      overdueNow.length === 0 && futureDue,
      'future-dated instalments are not overdue',
    );
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    for (const rid of rentalIds) {
      const { data: lines } = await db.from('rental_lines').select('booking_id').eq('rental_id', rid);
      const ids = (lines ?? []).map((l) => l.booking_id).filter(Boolean) as number[];
      if (ids.length) await db.from('bookings').delete().in('id', ids);
      await db.from('rentals').delete().eq('id', rid);
    }
    record('cleanup', true, `${rentalIds.length} synthetic rental(s) removed`);
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
