import 'server-only';
import { audit, computeRefund, type RefundException, type RefundInput, type RefundResult } from '@ai/foundation';
import { must, ok, supabaseAdmin } from '@ai/foundation/supabase';
import { waiveRemainingInstallments } from '@/lib/programs/orders';
import { programType } from '@/lib/programs/types';
import { withdrawRegistration } from '@/lib/programs/registration';

/**
 * Refund application (Module 4 Stage 7). Computes the policy default via the
 * pure engine, but staff always see it + can OVERRIDE the amount; the refund
 * goes to Credit on Account OR back to the original card/PAD (staff choice).
 * Applies to all program types except Club and Academy.
 */

export interface RefundQuoteInput {
  registrationId: number;
  withdrawalDateISO: string;
  totalUnits: number;
  unitsRemaining: number;
  unitsElapsed: number;
  exception?: RefundException;
}

interface RefundContext {
  input: Omit<RefundInput, 'withdrawalDateISO' | 'totalUnits' | 'unitsRemaining' | 'unitsElapsed' | 'exception'>;
  familyId: number | null;
  programType: string;
  status: string;
  /** What the family has actually paid toward this registration (cents). */
  paidCents: number;
}

/**
 * Money the family has PAID toward one registration. The order's paid
 * installments are attributed to this registration in proportion to its
 * share of the order (a multi-child cart is one order with several lines).
 */
async function paidTowardRegistration(registrationId: number): Promise<number> {
  const db = supabaseAdmin();
  const reg = must(await db.from('registrations').select('order_id, line_total_cents').eq('id', registrationId).maybeSingle(), 'registration.read');
  // No order on file (front-desk / imported registrations): the line total is
  // the only record of what was paid, so treat it as paid in full.
  if (!reg.order_id) return reg.line_total_cents ?? 0;
  const [{ data: order }, { data: insts }] = await Promise.all([
    db.from('program_orders').select('total_cents').eq('id', reg.order_id).maybeSingle(),
    db.from('program_installments').select('amount_cents, status').eq('order_id', reg.order_id),
  ]);
  const paid = (insts ?? []).filter((i) => i.status === 'paid').reduce((a, i) => a + i.amount_cents, 0);
  const orderTotal = order?.total_cents ?? 0;
  const line = reg.line_total_cents ?? 0;
  if (orderTotal <= 0 || line <= 0) return paid;
  return Math.min(line, Math.round((paid * line) / orderTotal));
}

async function loadRefundContext(registrationId: number): Promise<RefundContext> {
  const db = supabaseAdmin();
  const data = must(
    await db
      .from('registrations')
      .select('family_id, program_id, status, line_total_cents, refund_insurance, programs(proration_method, program_types(key), registration_opens_at)')
      .eq('id', registrationId)
      .maybeSingle(),
    'registration.read',
  );
  const program = data.programs as unknown as { proration_method: RefundInput['method']; program_types: { key: string }; registration_opens_at: string | null };
  // Program start: first session's date if present, else registration open date.
  const [{ data: sess }, paidCents] = await Promise.all([
    db.from('program_sessions').select('starts_at').eq('program_id', data.program_id).order('starts_at').limit(1).maybeSingle(),
    paidTowardRegistration(registrationId),
  ]);
  const startISO = (sess?.starts_at ?? program.registration_opens_at ?? new Date().toISOString()).slice(0, 10);
  return {
    input: { method: program.proration_method, feeCents: data.line_total_cents ?? 0, startDateISO: startISO, refundInsurance: data.refund_insurance },
    familyId: data.family_id,
    programType: program.program_types.key,
    status: data.status,
    paidCents,
  };
}

function quoteFromContext(ctx: RefundContext, input: RefundQuoteInput): { result: RefundResult; programType: string; blocked?: string } {
  const result = computeRefund({ ...ctx.input, withdrawalDateISO: input.withdrawalDateISO, totalUnits: input.totalUnits, unitsRemaining: input.unitsRemaining, unitsElapsed: input.unitsElapsed, exception: input.exception });
  let blocked: string | undefined;
  if (!programType(ctx.programType).usesRefundEngine) blocked = 'Club and Academy have their own refund handling (tuition/payment plans).';
  if (!blocked && ctx.status !== 'active' && ctx.status !== 'waitlisted') blocked = `This registration is already ${ctx.status} — a refund was applied or it was withdrawn.`;
  return { result, programType: ctx.programType, blocked };
}

/** Compute the policy-default refund for a registration (no side effects). */
export async function quoteRefund(input: RefundQuoteInput): Promise<{ result: RefundResult; programType: string; blocked?: string }> {
  return quoteFromContext(await loadRefundContext(input.registrationId), input);
}

export interface ApplyRefundInput extends RefundQuoteInput {
  destination: 'credit_on_account' | 'original_method';
  /** Staff override of the computed amount (cents); omit to use the policy default. */
  overrideAmountCents?: number;
  overrideReason?: string;
  actorClerkId: string;
}

/**
 * Apply a refund: withdraw the registration (frees the seat + advances the
 * waitlist), then move the money. Credit on Account is applied immediately;
 * original-method refunds are recorded for the Stripe rails to process.
 */
export async function applyRefund(input: ApplyRefundInput): Promise<{ amountCents: number; destination: string; ruleText: string }> {
  const db = supabaseAdmin();
  const ctx = await loadRefundContext(input.registrationId);
  const { result, programType, blocked } = quoteFromContext(ctx, input);
  if (blocked) throw new Error(blocked);

  const policyAmount = input.destination === 'original_method' ? result.refundAmountCents : result.creditAmountCents;
  // The engine prices the refund off the full line fee; a family on a payment
  // plan may have paid only part of it. Since the unpaid balance is waived
  // below, the refund can never exceed what was actually paid.
  const requested = input.overrideAmountCents ?? policyAmount;
  const amount = Math.min(requested, ctx.paidCents);
  if (input.destination === 'original_method' && !result.refundEligible && input.overrideAmountCents == null) {
    throw new Error(`Not refund-eligible to original method: ${result.ruleText} (override to force, or use Credit on Account).`);
  }

  // Order of operations is what makes a retry safe in both directions:
  //  1. credit FIRST, written once per registration (unique ledger ref — a
  //     retry after a later failure finds the row and skips);
  //  2. then withdraw (the registration stays active if step 1 threw, so
  //     staff simply retry);
  //  3. then waive whatever is still owed.
  const creditRef = `registration:${input.registrationId}`;
  if (amount > 0 && input.destination === 'credit_on_account' && ctx.familyId) {
    const { data: existing } = await db.from('credit_ledger').select('id').eq('family_id', ctx.familyId).eq('ref', creditRef).eq('reason', 'refund').maybeSingle();
    if (!existing) {
      const res = await db.rpc('credit_apply', { p_family_id: ctx.familyId, p_delta: amount, p_reason: 'refund', p_ref: creditRef, p_created_by: input.actorClerkId });
      if (res.error && res.error.code !== '23505') throw new Error(`refund.credit-on-account: ${res.error.message}`);
    }
  }

  await withdrawRegistration(input.registrationId, input.actorClerkId);
  const { sharedOrder } = await waiveRemainingInstallments(input.registrationId, input.actorClerkId);
  // original_method: record the intent; the Stripe refund is issued by the
  // rails/ops (kept out of the auto-path so no money moves without review).

  await audit({
    actorId: input.actorClerkId,
    action: 'registration.refunded',
    target: `registration:${input.registrationId}`,
    meta: {
      program_type: programType,
      destination: input.destination,
      amount_cents: amount,
      policy_amount_cents: policyAmount,
      paid_cents: ctx.paidCents,
      capped_to_paid: requested > amount,
      overridden: input.overrideAmountCents != null,
      override_reason: input.overrideReason,
      rule: result.ruleText,
      admin_fee_cents: result.adminFeeCents,
      // A multi-registration order keeps its plan; staff adjust it by hand.
      plan_left_in_place: sharedOrder,
    },
  });

  return { amountCents: amount, destination: input.destination, ruleText: result.ruleText };
}
