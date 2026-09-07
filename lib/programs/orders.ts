import 'server-only';
import { audit, torontoToday } from '@ai/foundation';
import { must, ok, supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Receivables for program registrations that do NOT go through the cart
 * checkout: Academy/Club offer acceptance (deposit + staff-dictated plan) and
 * drop-in session purchases. The cart path (`placeProgramOrder`) prices a
 * whole cart; this creates an order + installment schedule for ONE
 * registration whose amount the caller has already determined.
 *
 * Both paths write the same tables (program_orders / program_installments),
 * so /account/pay, dunning, reports and the Stripe webhook see every dollar
 * owed regardless of how the registration came to exist.
 */

export interface ScheduledPayment {
  label: string;
  amountCents: number;
  /** YYYY-MM-DD */
  dueDate: string;
}

export interface CreateOrderInput {
  registrationId: number;
  familyId: number | null;
  /** Total the family owes for this registration (after scholarships, deposits are part of it). */
  totalCents: number;
  /** Payments that sum to totalCents; an empty schedule with total 0 = a fully-covered registration. */
  schedule: ScheduledPayment[];
  actorClerkId: string;
  /** What produced this receivable, for the audit trail (e.g. 'academy-offer:12'). */
  source: string;
}

/** Split `totalCents` into `count` monthly installments starting `firstDueISO` (largest remainder first). */
export function monthlySchedule(totalCents: number, count: number, firstDueISO: string, labelPrefix = 'Installment'): ScheduledPayment[] {
  const n = Math.max(1, Math.floor(count));
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  const [y, m, d] = firstDueISO.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const date = new Date(Date.UTC(y, m - 1 + i, Math.min(d, 28), 12));
    return {
      label: n === 1 ? 'Payment' : `${labelPrefix} ${i + 1} of ${n}`,
      amountCents: base + (i < remainder ? 1 : 0),
      dueDate: date.toISOString().slice(0, 10),
    };
  });
}

/**
 * Create the order and its installments for one registration and link them.
 * Refuses when the registration already carries an order (call recalculateOwed
 * or adjust the existing plan instead of stacking a second receivable).
 */
export async function createOrderForRegistration(input: CreateOrderInput): Promise<{ orderId: number }> {
  const db = supabaseAdmin();
  const scheduled = input.schedule.reduce((a, s) => a + s.amountCents, 0);
  if (scheduled !== input.totalCents) {
    throw new Error(`order schedule (${scheduled}) does not sum to the total (${input.totalCents})`);
  }
  if (input.schedule.some((s) => s.amountCents < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(s.dueDate))) {
    throw new Error('order schedule has a negative amount or malformed due date');
  }

  const reg = must(
    await db.from('registrations').select('id, order_id, family_id').eq('id', input.registrationId).maybeSingle(),
    'registration.read',
  );
  if (reg.order_id) throw new Error('This registration already has an order.');

  const today = torontoToday();
  const status = input.totalCents === 0 ? 'paid' : input.schedule.length > 1 ? 'plan_active' : 'pending';
  const order = must(
    await db
      .from('program_orders')
      .insert({
        family_id: input.familyId ?? reg.family_id,
        cart_id: null,
        subtotal_cents: input.totalCents,
        total_cents: input.totalCents,
        pay_in_full: input.schedule.length <= 1,
        status,
        created_by: input.actorClerkId,
      })
      .select('id')
      .single(),
    'order.create',
  );
  const orderId = order.id as number;

  if (input.schedule.length) {
    ok(
      await db.from('program_installments').insert(
        input.schedule.map((s, i) => ({ order_id: orderId, seq: i + 1, label: s.label, amount_cents: s.amountCents, due_date: s.dueDate < today ? today : s.dueDate })),
      ),
      'order.schedule',
    );
  }

  ok(
    await db.from('registrations').update({ order_id: orderId, line_total_cents: input.totalCents }).eq('id', input.registrationId),
    'registration.link-order',
  );

  await audit({
    actorId: input.actorClerkId,
    action: 'program_order.placed',
    target: `program_order:${orderId}`,
    meta: { source: input.source, registration_id: input.registrationId, total: input.totalCents, installments: input.schedule.length },
  });
  return { orderId };
}

/**
 * Waive whatever is still owed on a registration's order after a withdrawal or
 * refund, so the family stops being billed for a program they left. When the
 * order also carries OTHER live registrations (a multi-child cart), the plan
 * is left in place and `sharedOrder` is returned so staff can adjust manually.
 */
export async function waiveRemainingInstallments(registrationId: number, actorClerkId: string): Promise<{ waived: number; sharedOrder: boolean }> {
  const db = supabaseAdmin();
  const reg = must(await db.from('registrations').select('order_id').eq('id', registrationId).maybeSingle(), 'registration.read');
  if (!reg.order_id) return { waived: 0, sharedOrder: false };

  const { count: others } = await db
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', reg.order_id)
    .neq('id', registrationId)
    .in('status', ['active', 'waitlisted']);
  if ((others ?? 0) > 0) return { waived: 0, sharedOrder: true };

  const waived = ok(
    await db
      .from('program_installments')
      .update({ status: 'waived' })
      .eq('order_id', reg.order_id)
      .in('status', ['pending', 'failed'])
      .select('id'),
    'installments.waive',
  );
  const { recalculateOwed } = await import('@/lib/programs/checkout');
  await recalculateOwed(reg.order_id);
  await audit({
    actorId: actorClerkId,
    action: 'program_installments.waived',
    target: `program_order:${reg.order_id}`,
    meta: { registration_id: registrationId, waived: waived?.length ?? 0 },
  });
  return { waived: waived?.length ?? 0, sharedOrder: false };
}
