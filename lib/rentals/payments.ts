import 'server-only';
import {
  audit,
  buildDefaultSchedule,
  buildPlanSchedule,
  canTransition,
  deriveStatus,
  torontoToday,
  type InstallmentState,
  type PlanEntryInput,
  type RentalStatus,
  type ScheduleEntry,
} from '@ai/foundation';
import { charge, createInvoice, padStatus } from '@ai/foundation/stripe';
import { notify } from '@ai/foundation/notify';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { cancelBooking } from '@/lib/bookings';

/**
 * Rental payments + status orchestration (Module 3 Stage 4). The scheduling
 * math and state machine are pure in @ai/foundation/rentals-core; this wires
 * them to the DB, the Module 0 Stripe rails (charge / invoice / PAD status),
 * and notify().
 *
 * Flow: mark booked -> generate schedule (deposit due 5 business days out) +
 * confirm the held bookings -> on each due date, PAD auto-charge if agreed
 * else send an invoice + staff follow-up. Auto-charge failure -> overdue +
 * notify staff. Cancel releases the slots (deposit non-refundable).
 */

const OPS_EMAIL = process.env.OPERATIONS_EMAIL ?? 'mark.peterson@athleteinstitute.ca';

export interface Installment extends InstallmentState {
  id: number;
  rental_id: number;
  seq: number;
  label: string;
}

const I_COLS = 'id, rental_id, seq, label, amount_cents, due_date, is_deposit, status';

async function loadInstallments(rentalId: number): Promise<Installment[]> {
  const { data, error } = await supabaseAdmin()
    .from('rental_installments')
    .select(I_COLS)
    .eq('rental_id', rentalId)
    .order('seq');
  if (error) throw new Error(error.message);
  return (data ?? []) as Installment[];
}

/** Recompute + persist the rental status from its installments. */
export async function refreshRentalStatus(rentalId: number): Promise<RentalStatus> {
  const db = supabaseAdmin();
  const { data: rental } = await db.from('rentals').select('status').eq('id', rentalId).single();
  const cancelled = rental!.status === 'cancelled';
  const installments = await loadInstallments(rentalId);
  const next = deriveStatus(installments, torontoToday(), cancelled);
  if (next !== rental!.status && (cancelled || canTransition(rental!.status as RentalStatus, next) || next === rental!.status)) {
    await db.from('rentals').update({ status: next }).eq('id', rentalId);
  }
  return next;
}

/**
 * Mark a quote booked: generate the installment schedule, confirm all the
 * held (tentative) bookings, and move to deposit_due. `plan` overrides the
 * default 25%-deposit-plus-balance schedule.
 */
export async function markRentalBooked(
  rentalId: number,
  actorClerkId: string,
  opts: { plan?: PlanEntryInput[]; balanceDueDate?: string } = {},
): Promise<{ status: RentalStatus; installments: ScheduleEntry[] }> {
  const db = supabaseAdmin();
  const { data: rental, error } = await db
    .from('rentals')
    .select('id, status, is_internal, total_cents, deposit_pct, waiver_id')
    .eq('id', rentalId)
    .single();
  if (error) throw new Error(error.message);
  if (rental.status !== 'quote') throw new Error(`Rental is ${rental.status}, not a quote.`);
  if (rental.is_internal) throw new Error('Internal rentals have no payment schedule.');
  if (rental.total_cents <= 0) throw new Error('Add at least one line before booking.');

  // Confirm-gate: an attached waiver must be signed at its current version.
  const { isWaiverSatisfied } = await import('@/lib/waivers');
  if (!(await isWaiverSatisfied('rental', rentalId, rental.waiver_id))) {
    throw new Error('The attached waiver must be signed before this rental can be booked.');
  }

  const today = torontoToday();
  const balanceDue = opts.balanceDueDate ?? addMonthsISO(today, 1);
  const schedule = opts.plan
    ? buildPlanSchedule(rental.total_cents, opts.plan)
    : buildDefaultSchedule(rental.total_cents, rental.deposit_pct, today, balanceDue);

  // Persist installments.
  const { error: iErr } = await db.from('rental_installments').insert(
    schedule.map((s) => ({ rental_id: rentalId, seq: s.seq, label: s.label, amount_cents: s.amount_cents, due_date: s.due_date, is_deposit: s.is_deposit })),
  );
  if (iErr) throw new Error(`schedule create failed: ${iErr.message}`);

  // Confirm the held bookings (quote -> confirmed on the master schedule).
  const { data: lines } = await db.from('rental_lines').select('booking_id').eq('rental_id', rentalId);
  const bookingIds = (lines ?? []).map((l) => l.booking_id).filter(Boolean) as number[];
  if (bookingIds.length) {
    await db.from('bookings').update({ status: 'confirmed' }).in('id', bookingIds);
  }

  await db.from('rentals').update({ status: 'deposit_due', booked_at: new Date().toISOString(), balance_due_date: balanceDue }).eq('id', rentalId);
  await audit({ actorId: actorClerkId, action: 'rental.booked', target: `rental:${rentalId}`, meta: { installments: schedule.length, total: rental.total_cents } });

  return { status: 'deposit_due', installments: schedule };
}

/**
 * Process one installment on/after its due date: PAD auto-charge if the payer
 * has set up + agreed to PAD, else send an invoice and schedule a staff
 * follow-up. Charge failure -> mark failed (rental becomes overdue) + notify.
 * Returns the action taken.
 */
export async function processInstallment(installmentId: number, actorClerkId: string): Promise<'charged' | 'invoiced' | 'failed'> {
  const db = supabaseAdmin();
  const { data: inst, error } = await db
    .from('rental_installments')
    .select('id, rental_id, label, amount_cents, status')
    .eq('id', installmentId)
    .single();
  if (error) throw new Error(error.message);
  if (inst.status !== 'pending') throw new Error(`Installment already ${inst.status}.`);

  const { data: rental } = await db
    .from('rentals')
    .select('id, title, stripe_customer_id, pad_agreed, contact_email')
    .eq('id', inst.rental_id)
    .single();

  const padReady = rental!.stripe_customer_id && rental!.pad_agreed
    ? (await padStatus(rental!.stripe_customer_id)).ready
    : false;

  if (padReady) {
    try {
      const pi = await charge({
        customerId: rental!.stripe_customer_id!,
        amountCents: inst.amount_cents,
        methodType: 'acss_debit',
        description: `${rental!.title} - ${inst.label}`,
        metadata: { rental_id: String(inst.rental_id), installment_id: String(inst.id) },
      });
      // PAD settles asynchronously; 'processing' is normal. Final state is set
      // by the Stripe webhook (billing-events) -> markInstallmentPaid/Failed.
      await db.from('rental_installments').update({ stripe_payment_intent: pi.id }).eq('id', inst.id);
      await audit({ actorId: actorClerkId, action: 'rental.installment.auto-charged', target: `rental_installment:${inst.id}`, meta: { pi: pi.id, amount: inst.amount_cents } });
      return 'charged';
    } catch (err) {
      await markInstallmentFailed(inst.id, err instanceof Error ? err.message : 'charge failed', actorClerkId);
      return 'failed';
    }
  }

  // No PAD: invoice + staff follow-up reminder.
  let invoiceId: string | null = null;
  if (rental!.stripe_customer_id) {
    const inv = await createInvoice({
      customerId: rental!.stripe_customer_id,
      items: [{ description: `${rental!.title} - ${inst.label}`, amountCents: inst.amount_cents }],
      daysUntilDue: 5,
      metadata: { rental_id: String(inst.rental_id), installment_id: String(inst.id) },
    });
    invoiceId = inv.id ?? null;
  }
  await db.from('rental_installments').update({ stripe_invoice_id: invoiceId }).eq('id', inst.id);
  await notify({
    to: { email: OPS_EMAIL },
    channels: ['email'],
    template: 'generic',
    data: {
      heading: 'Rental payment follow-up needed',
      body: `${rental!.title}: "${inst.label}" ($${(inst.amount_cents / 100).toFixed(2)}) is due and the payer has no PAD auto-charge set up. An invoice was ${invoiceId ? 'sent' : 'NOT sent (no Stripe customer)'} - please chase payment.`,
      ctaLabel: 'Open rental',
      ctaUrl: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://admin.athleteinstitute.ca'}/rentals/${inst.rental_id}`,
    },
  });
  await audit({ actorId: actorClerkId, action: 'rental.installment.invoiced', target: `rental_installment:${inst.id}`, meta: { invoice: invoiceId } });
  return 'invoiced';
}

export async function markInstallmentPaid(installmentId: number, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: inst } = await db.from('rental_installments').select('rental_id').eq('id', installmentId).single();
  await db.from('rental_installments').update({ status: 'paid', paid_at: new Date().toISOString(), failure_reason: null }).eq('id', installmentId);
  await audit({ actorId: actorClerkId, action: 'rental.installment.paid', target: `rental_installment:${installmentId}` });
  await refreshRentalStatus(inst!.rental_id);
}

export async function markInstallmentFailed(installmentId: number, reason: string, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: inst } = await db.from('rental_installments').select('rental_id, label').eq('id', installmentId).single();
  await db.from('rental_installments').update({ status: 'failed', failure_reason: reason }).eq('id', installmentId);
  await db.from('rentals').update({ status: 'overdue' }).eq('id', inst!.rental_id);
  await audit({ actorId: actorClerkId, action: 'rental.installment.failed', target: `rental_installment:${installmentId}`, meta: { reason } });
  await notify({
    to: { email: OPS_EMAIL },
    channels: ['email'],
    template: 'generic',
    data: {
      heading: 'Rental payment failed - now overdue',
      body: `A payment for rental #${inst!.rental_id} ("${inst!.label}") failed: ${reason}. The rental is marked overdue.`,
      ctaLabel: 'Open rental',
      ctaUrl: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://admin.athleteinstitute.ca'}/rentals/${inst!.rental_id}`,
    },
  });
}

/** Manual "record payment" (e-transfer, cheque, etc.). */
export async function recordManualPayment(installmentId: number, actorClerkId: string): Promise<void> {
  await markInstallmentPaid(installmentId, actorClerkId);
}

/** Cancel: release every slot booking; deposit is non-refundable (spec). */
export async function cancelRental(rentalId: number, actorClerkId: string, reason?: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: lines } = await db.from('rental_lines').select('booking_id').eq('rental_id', rentalId);
  for (const l of lines ?? []) {
    if (l.booking_id) await cancelBooking(l.booking_id, actorClerkId, `rental cancelled: ${reason ?? ''}`);
  }
  await db.from('rentals').update({ status: 'cancelled' }).eq('id', rentalId);
  await audit({ actorId: actorClerkId, action: 'rental.cancelled', target: `rental:${rentalId}`, meta: { reason, deposit_non_refundable: true } });
}

/** Cron: process all due installments (auto-charge or invoice) + mark overdue. */
export async function processDueInstallments(actorClerkId = 'system:cron'): Promise<{ processed: number; overdue: number }> {
  const db = supabaseAdmin();
  const today = torontoToday();
  const { data: due } = await db
    .from('rental_installments')
    .select('id, rental_id, stripe_invoice_id, stripe_payment_intent')
    .eq('status', 'pending')
    .lte('due_date', today);

  let processed = 0;
  for (const inst of due ?? []) {
    // Only kick off collection once (no invoice/PI yet); otherwise it's already
    // out and awaiting payment - refreshRentalStatus flips it overdue below.
    if (!inst.stripe_invoice_id && !inst.stripe_payment_intent) {
      await processInstallment(inst.id, actorClerkId);
      processed++;
    }
  }
  // Re-derive statuses (past-due pending -> overdue).
  const rentalIds = [...new Set((due ?? []).map((d) => d.rental_id))];
  let overdue = 0;
  for (const rid of rentalIds) {
    if ((await refreshRentalStatus(rid)) === 'overdue') overdue++;
  }
  return { processed, overdue };
}

function addMonthsISO(dateISO: string, months: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}
