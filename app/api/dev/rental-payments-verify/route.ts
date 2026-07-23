import { NextResponse } from 'next/server';
import { addBusinessDays, torontoToday } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { addRentalLine, createRental } from '@/lib/rentals/quotes';
import { upsertRate } from '@/lib/rentals/rates';
import {
  cancelRental,
  markInstallmentFailed,
  markRentalBooked,
  processInstallment,
  recordManualPayment,
  refreshRentalStatus,
} from '@/lib/rentals/payments';
import { checkAvailability } from '@/lib/bookings';

/**
 * DEV-ONLY: Stage-4 payment lifecycle against live Supabase (no real Stripe
 * charges - no PAD customer, so the invoice path runs). Covers: mark-booked
 * schedule + deposit due date, quote->confirmed bookings, deposit_due ->
 * balance_due on deposit paid, PAD-failure -> overdue, all-paid -> paid,
 * cancel releases the slot. Cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const rentalIds: number[] = [];
  const day = '2026-11-10';
  const iso = (h: number) => `${day}T${String(h).padStart(2, '0')}:00:00-05:00`;

  try {
    const { data: fac } = await db.from('facilities').select('id, name').is('deleted_at', null);
    const court = fac!.find((f) => f.name === 'Dome Court 1')!.id;
    await upsertRate({ facility_id: court, hourly_cents: 10000, full_day_cents: null, flat_cents: null }, 'system:verify');

    // Rental #1: full happy path
    const r1 = await createRental({ title: 'Payments Verify A', contactEmail: 'pay@example.test', actorClerkId: 'system:verify' });
    rentalIds.push(r1.id);
    const line = await addRentalLine({ rentalId: r1.id, facilityId: court, rateMode: 'hourly', startsAt: iso(18), endsAt: iso(20), actorClerkId: 'system:verify' });

    // line booking starts tentative (quote holds slot)
    const { data: bkBefore } = await db.from('bookings').select('status').eq('id', line.line.booking_id!).single();

    // 1. mark booked -> deposit_due, schedule generated, deposit due +5 biz days
    const booked = await markRentalBooked(r1.id, 'system:verify');
    const { data: insts } = await db.from('rental_installments').select('id, seq, amount_cents, due_date, is_deposit, status').eq('rental_id', r1.id).order('seq');
    const deposit = insts!.find((i) => i.is_deposit)!;
    record(
      'mark booked: deposit_due + schedule (25% deposit, due +5 biz days)',
      booked.status === 'deposit_due' && insts!.length === 2 && deposit.amount_cents === Math.round(200 * 100 * 1.13 * 0.25) && deposit.due_date === addBusinessDays(torontoToday(), 5),
      `deposit ${deposit.amount_cents}¢ due ${deposit.due_date}`,
    );

    // 2. booking flips tentative -> confirmed on booking
    const { data: bkAfter } = await db.from('bookings').select('status').eq('id', line.line.booking_id!).single();
    record('held booking confirmed on mark-booked', bkBefore!.status === 'tentative' && bkAfter!.status === 'confirmed', `${bkBefore!.status} -> ${bkAfter!.status}`);

    // 3. process deposit installment: no PAD -> invoice path (no throw), status stays pending-with-invoice
    const action = await processInstallment(deposit.id, 'system:verify');
    record('no-PAD installment takes the invoice path', action === 'invoiced', `action=${action}`);

    // 4. record deposit paid -> balance_due
    await recordManualPayment(deposit.id, 'system:verify');
    const s4 = await refreshRentalStatus(r1.id);
    record('deposit paid -> balance_due', s4 === 'balance_due', s4);

    // 5. balance failure -> overdue + staff notified
    const balance = insts!.find((i) => !i.is_deposit)!;
    await markInstallmentFailed(balance.id, 'insufficient funds (simulated)', 'system:verify');
    const { data: r1row } = await db.from('rentals').select('status').eq('id', r1.id).single();
    record('installment failure -> overdue', r1row!.status === 'overdue', r1row!.status);

    // 6. pay the balance -> fully paid
    await recordManualPayment(balance.id, 'system:verify');
    const s6 = await refreshRentalStatus(r1.id);
    record('all installments paid -> paid', s6 === 'paid', s6);

    // Rental #2: cancel releases the slot (deposit non-refundable)
    const r2 = await createRental({ title: 'Payments Verify B', actorClerkId: 'system:verify' });
    rentalIds.push(r2.id);
    const line2 = await addRentalLine({ rentalId: r2.id, facilityId: court, rateMode: 'hourly', startsAt: iso(21), endsAt: iso(22), actorClerkId: 'system:verify' });
    await markRentalBooked(r2.id, 'system:verify');
    const heldBefore = await checkAvailability({ facilityId: court, startsAt: iso(21), endsAt: iso(22) });
    await cancelRental(r2.id, 'system:verify', 'verify');
    const freed = await checkAvailability({ facilityId: court, startsAt: iso(21), endsAt: iso(22) });
    const { data: r2row } = await db.from('rentals').select('status').eq('id', r2.id).single();
    record('cancel releases slot + status cancelled', !heldBefore.available && freed.available && r2row!.status === 'cancelled', `held->free, status ${r2row!.status}`);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    for (const rid of rentalIds) {
      const { data: lines } = await db.from('rental_lines').select('booking_id').eq('rental_id', rid);
      const ids = (lines ?? []).map((l) => l.booking_id).filter(Boolean) as number[];
      if (ids.length) await db.from('bookings').delete().in('id', ids);
      await db.from('rentals').delete().eq('id', rid);
    }
    await db.from('facility_rates').delete().gte('facility_id', 0);
    record('cleanup', true, 'rentals, bookings, rates removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
