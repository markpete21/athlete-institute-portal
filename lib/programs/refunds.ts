import 'server-only';
import { audit, computeRefund, type RefundException, type RefundInput, type RefundResult } from '@ai/foundation';
import { must, ok, supabaseAdmin } from '@ai/foundation/supabase';
import { waiveRemainingInstallments } from '@/lib/programs/orders';
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
  const { data: sess } = await db.from('program_sessions').select('starts_at').eq('program_id', data.program_id).order('starts_at').limit(1).maybeSingle();
  const startISO = (sess?.starts_at ?? program.registration_opens_at ?? new Date().toISOString()).slice(0, 10);
  return {
    input: { method: program.proration_method, feeCents: data.line_total_cents ?? 0, startDateISO: startISO, refundInsurance: data.refund_insurance },
    familyId: data.family_id,
    programType: program.program_types.key,
    status: data.status,
  };
}

function quoteFromContext(ctx: RefundContext, input: RefundQuoteInput): { result: RefundResult; programType: string; blocked?: string } {
  const result = computeRefund({ ...ctx.input, withdrawalDateISO: input.withdrawalDateISO, totalUnits: input.totalUnits, unitsRemaining: input.unitsRemaining, unitsElapsed: input.unitsElapsed, exception: input.exception });
  let blocked: string | undefined;
  if (!REFUNDABLE_TYPES_EXCLUDED.has(ctx.programType)) blocked = undefined;
  else blocked = 'Club and Academy have their own refund handling (tuition/payment plans).';
  if (!blocked && ctx.status !== 'active' && ctx.status !== 'waitlisted') blocked = `This registration is already ${ctx.status} — a refund was applied or it was withdrawn.`;
  return { result, programType: ctx.programType, blocked };
}

/** Types whose refunds are case-by-case (tuition / payment plans), never the engine. */
const REFUNDABLE_TYPES_EXCLUDED = new Set(['club', 'academy']);

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
  const amount = input.overrideAmountCents ?? policyAmount;
  if (input.destination === 'original_method' && !result.refundEligible && input.overrideAmountCents == null) {
    throw new Error(`Not refund-eligible to original method: ${result.ruleText} (override to force, or use Credit on Account).`);
  }

  // Withdraw the registration (advances the waitlist behind it). This is the
  // idempotency gate: withdrawRegistration only succeeds once, so a retried
  // refund cannot credit the family twice.
  await withdrawRegistration(input.registrationId, input.actorClerkId);

  // The family stops owing for a program they left.
  const { sharedOrder } = await waiveRemainingInstallments(input.registrationId, input.actorClerkId);

  if (amount > 0 && input.destination === 'credit_on_account' && ctx.familyId) {
    ok(
      await db.rpc('credit_apply', { p_family_id: ctx.familyId, p_delta: amount, p_reason: 'refund', p_ref: `registration:${input.registrationId}`, p_created_by: input.actorClerkId }),
      'refund.credit-on-account',
    );
  }
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
