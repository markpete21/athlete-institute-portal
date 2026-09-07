import 'server-only';
import { audit, buildDefaultSchedule, buildPlanSchedule, canTransition, deriveStatus, torontoToday, type InstallmentState, type PlanEntryInput, type RentalStatus, type ScheduleEntry, formatCAD } from '@ai/foundation';
import { charge, createInvoice, padStatus } from '@ai/foundation/stripe';
import { notify } from '@ai/foundation/notify';
import { must, ok, rows, supabaseAdmin } from '@ai/foundation/supabase';
import { cancelBooking, cancelBookingsBySourceRef } from '@/lib/bookings';

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
  const rental = must(await db.from('rentals').select('status').eq('id', rentalId).maybeSingle(), 'rental.read');
  const current = rental.status as RentalStatus;
  // A quote has no schedule yet — only markRentalBooked moves it forward.
  if (current === 'quote') return current;
  const cancelled = current === 'cancelled';
  const installments = await loadInstallments(rentalId);
  const next = deriveStatus(installments, torontoToday(), cancelled);
  if (next === current) return next;
  if (!cancelled && !canTransition(current, next)) {
    // Derived state disagrees with the machine — never write an illegal hop
    // silently; leave it for a human and record why.
    await audit({ actorId: 'system:rentals', action: 'rental.status-blocked', target: `rental:${rentalId}`, meta: { from: current, to: next } });
    return current;
  }
  ok(await db.from('rentals').update({ status: next }).eq('id', rentalId), 'rental.status');
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
    .select('id, status, is_internal, total_cents, deposit_pct, waiver_id, deposit_due_date, balance_due_date')
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
  const balanceDue = opts.balanceDueDate ?? rental.balance_due_date ?? addMonthsISO(today, 1);
  // Priority: explicit plan > dates stored on the rental (the booking wizard
  // writes deposit_due_date/balance_due_date at quote time) > defaults.
  const schedule = opts.plan
    ? buildPlanSchedule(rental.total_cents, opts.plan)
    : rental.deposit_due_date
      ? buildPlanSchedule(rental.total_cents, [
          { label: `Deposit (${rental.deposit_pct}%)`, pct: rental.deposit_pct, dueDate: rental.deposit_due_date },
          { label: 'Balance', pct: 100 - rental.deposit_pct, dueDate: balanceDue },
        ])
      : buildDefaultSchedule(rental.total_cents, rental.deposit_pct, today, balanceDue);

  // Persist installments.
  const { error: iErr } = await db.from('rental_installments').insert(
    schedule.map((s) => ({ rental_id: rentalId, seq: s.seq, label: s.label, amount_cents: s.amount_cents, due_date: s.due_date, is_deposit: s.is_deposit })),
  );
  if (iErr) throw new Error(`schedule create failed: ${iErr.message}`);

  // The held bookings stay TENTATIVE: paying the deposit is what turns the
  // quote into a confirmed booking (markInstallmentPaid flips them). Wizard
  // book-intent lines were already created confirmed and are untouched.

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

  const rental = must(
    await db.from('rentals').select('id, title, stripe_customer_id, pad_agreed, contact_email').eq('id', inst.rental_id).maybeSingle(),
    'rental.read',
  );

  const padReady = rental.stripe_customer_id && rental.pad_agreed
    ? (await padStatus(rental.stripe_customer_id)).ready
    : false;

  if (padReady) {
    try {
      const pi = await charge({
        customerId: rental.stripe_customer_id!,
        amountCents: inst.amount_cents,
        methodType: 'acss_debit',
        description: `${rental.title} - ${inst.label}`,
        metadata: { rental_id: String(inst.rental_id), installment_id: String(inst.id) },
      });
      // PAD settles asynchronously; 'processing' is normal. Final state is set
      // by the Stripe webhook (billing-events) -> markInstallmentPaid/Failed.
      ok(await db.from('rental_installments').update({ stripe_payment_intent: pi.id, processed_at: new Date().toISOString() }).eq('id', inst.id), 'installment.charged');
      await audit({ actorId: actorClerkId, action: 'rental.installment.auto-charged', target: `rental_installment:${inst.id}`, meta: { pi: pi.id, amount: inst.amount_cents } });
      return 'charged';
    } catch (err) {
      await markInstallmentFailed(inst.id, err instanceof Error ? err.message : 'charge failed', actorClerkId);
      return 'failed';
    }
  }

  // No PAD: invoice + staff follow-up reminder.
  let invoiceId: string | null = null;
  if (rental.stripe_customer_id) {
    const inv = await createInvoice({
      customerId: rental.stripe_customer_id,
      items: [{ description: `${rental.title} - ${inst.label}`, amountCents: inst.amount_cents }],
      daysUntilDue: 5,
      metadata: { rental_id: String(inst.rental_id), installment_id: String(inst.id) },
    });
    invoiceId = inv.id ?? null;
  }
  ok(await db.from('rental_installments').update({ stripe_invoice_id: invoiceId, processed_at: new Date().toISOString() }).eq('id', inst.id), 'installment.invoiced');
  await notify({
    to: { email: OPS_EMAIL },
    channels: ['email'],
    template: 'generic',
    data: {
      heading: 'Rental payment follow-up needed',
      body: `${rental.title}: "${inst.label}" (${formatCAD(inst.amount_cents)}) is due and the payer has no PAD auto-charge set up. An invoice was ${invoiceId ? 'sent' : 'NOT sent (no Stripe customer)'} - please chase payment.`,
      ctaLabel: 'Open rental',
      ctaUrl: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://admin.athleteinstitute.ca'}/rentals/${inst.rental_id}`,
    },
  });
  await audit({ actorId: actorClerkId, action: 'rental.installment.invoiced', target: `rental_installment:${inst.id}`, meta: { invoice: invoiceId } });
  return 'invoiced';
}

export async function markInstallmentPaid(installmentId: number, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const inst = must(await db.from('rental_installments').select('rental_id, is_deposit, status').eq('id', installmentId).maybeSingle(), 'installment.read');
  // Idempotent: a webhook replay or a manual record-paid racing the webhook
  // settles once. Only a pending/failed installment can become paid.
  const flipped = rows(
    await db.from('rental_installments').update({ status: 'paid', paid_at: new Date().toISOString(), failure_reason: null })
      .eq('id', installmentId).in('status', ['pending', 'failed']).select('id'),
    'installment.paid',
  );
  if (!flipped.length) return;
  await audit({ actorId: actorClerkId, action: 'rental.installment.paid', target: `rental_installment:${installmentId}` });

  // Deposit paid -> the quote's tentative holds become CONFIRMED bookings.
  // Single choke point: manual record-paid, PAD charges and invoice webhooks
  // all land here, so every payment path confirms the slots.
  if (inst.is_deposit) {
    const { data: lines } = await db.from('rental_lines').select('booking_id').eq('rental_id', inst.rental_id);
    const bookingIds = (lines ?? []).map((l) => l.booking_id).filter(Boolean) as number[];
    if (bookingIds.length) {
      const { error } = await db
        .from('bookings')
        .update({ status: 'confirmed' })
        .in('id', bookingIds)
        .eq('status', 'tentative');
      if (error) throw new Error(`booking confirm failed: ${error.message}`);
    }
    await audit({ actorId: actorClerkId, action: 'rental.confirmed-on-deposit', target: `rental:${inst.rental_id}`, meta: { bookings: bookingIds.length } });
  }

  await refreshRentalStatus(inst.rental_id);
}

export async function markInstallmentFailed(installmentId: number, reason: string, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const inst = must(await db.from('rental_installments').select('rental_id, label, status').eq('id', installmentId).maybeSingle(), 'installment.read');
  // A late or replayed payment.failed must never fail-over a settled or
  // waived installment, and the rental status is DERIVED (state machine), not
  // written directly.
  const flipped = rows(
    await db.from('rental_installments').update({ status: 'failed', failure_reason: reason })
      .eq('id', installmentId).eq('status', 'pending').select('id'),
    'installment.failed',
  );
  if (!flipped.length) return;
  await refreshRentalStatus(inst.rental_id);
  await audit({ actorId: actorClerkId, action: 'rental.installment.failed', target: `rental_installment:${installmentId}`, meta: { reason } });
  await notify({
    to: { email: OPS_EMAIL },
    channels: ['email'],
    template: 'generic',
    data: {
      heading: 'Rental payment failed - now overdue',
      body: `A payment for rental #${inst.rental_id} ("${inst.label}") failed: ${reason}. The rental is marked overdue.`,
      ctaLabel: 'Open rental',
      ctaUrl: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://admin.athleteinstitute.ca'}/rentals/${inst.rental_id}`,
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
  const lines = rows(await db.from('rental_lines').select('booking_id').eq('rental_id', rentalId), 'rental_lines.read');
  for (const l of lines) {
    if (l.booking_id) await cancelBooking(l.booking_id, actorClerkId, `rental cancelled: ${reason ?? ''}`);
  }
  // The wizard's "block other facilities" rows are plain internal bookings
  // tied to the rental by source_ref — release them too.
  await cancelBookingsBySourceRef(`rental-block:${rentalId}`, actorClerkId, `rental cancelled: ${reason ?? ''}`);
  ok(await db.from('rentals').update({ status: 'cancelled' }).eq('id', rentalId), 'rental.cancel');
  await audit({ actorId: actorClerkId, action: 'rental.cancelled', target: `rental:${rentalId}`, meta: { reason, deposit_non_refundable: true } });
}

/** Cron: process all due installments (auto-charge or invoice) + mark overdue. */
export async function processDueInstallments(actorClerkId = 'system:cron'): Promise<{ processed: number; overdue: number }> {
  const db = supabaseAdmin();
  const today = torontoToday();
  const due = rows(
    await db
      .from('rental_installments')
      .select('id, rental_id, stripe_invoice_id, stripe_payment_intent, processed_at')
      .eq('status', 'pending')
      .lte('due_date', today),
    'installments.due',
  );

  let processed = 0;
  for (const inst of due) {
    // Kick off collection ONCE per installment (processed_at is stamped on
    // both the charge and the invoice path); afterwards it is out awaiting
    // payment and refreshRentalStatus flips the rental overdue below.
    if (!inst.processed_at && !inst.stripe_invoice_id && !inst.stripe_payment_intent) {
      await processInstallment(inst.id, actorClerkId);
      processed++;
    }
  }
  // Re-derive statuses (past-due pending -> overdue).
  const rentalIds = [...new Set(due.map((d) => d.rental_id))];
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
