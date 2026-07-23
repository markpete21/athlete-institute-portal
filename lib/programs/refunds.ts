import 'server-only';
import { audit, computeRefund, type RefundException, type RefundInput, type RefundResult } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { applyPlayPoints } from '@/lib/credits';
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

async function loadRefundContext(registrationId: number): Promise<{ input: Omit<RefundInput, 'withdrawalDateISO' | 'totalUnits' | 'unitsRemaining' | 'unitsElapsed' | 'exception'>; familyId: number | null; programType: string }> {
  const { data, error } = await supabaseAdmin()
    .from('registrations')
    .select('family_id, line_total_cents, refund_insurance, programs(proration_method, program_types(key), registration_opens_at)')
    .eq('id', registrationId)
    .single();
  if (error) throw new Error(error.message);
  const program = data.programs as unknown as { proration_method: RefundInput['method']; program_types: { key: string }; registration_opens_at: string | null };
  // Program start: first session's date if present, else registration open date.
  const { data: sess } = await supabaseAdmin().from('program_sessions').select('starts_at').eq('program_id', (await supabaseAdmin().from('registrations').select('program_id').eq('id', registrationId).single()).data!.program_id).order('starts_at').limit(1).maybeSingle();
  const startISO = (sess?.starts_at ?? program.registration_opens_at ?? new Date().toISOString()).slice(0, 10);
  return {
    input: { method: program.proration_method, feeCents: data.line_total_cents ?? 0, startDateISO: startISO, refundInsurance: data.refund_insurance },
    familyId: data.family_id,
    programType: program.program_types.key,
  };
}

/** Compute the policy-default refund for a registration (no side effects). */
export async function quoteRefund(input: RefundQuoteInput): Promise<{ result: RefundResult; programType: string; blocked?: string }> {
  const ctx = await loadRefundContext(input.registrationId);
  if (ctx.programType === 'club' || ctx.programType === 'academy') {
    return { result: computeRefund({ ...ctx.input, withdrawalDateISO: input.withdrawalDateISO, totalUnits: input.totalUnits, unitsRemaining: input.unitsRemaining, unitsElapsed: input.unitsElapsed, exception: input.exception }), programType: ctx.programType, blocked: 'Club and Academy have their own refund handling (tuition/payment plans).' };
  }
  const result = computeRefund({ ...ctx.input, withdrawalDateISO: input.withdrawalDateISO, totalUnits: input.totalUnits, unitsRemaining: input.unitsRemaining, unitsElapsed: input.unitsElapsed, exception: input.exception });
  return { result, programType: ctx.programType };
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
  const { result, programType, blocked } = await quoteRefund(input);
  if (blocked) throw new Error(blocked);

  const ctx = await loadRefundContext(input.registrationId);
  const policyAmount = input.destination === 'original_method' ? result.refundAmountCents : result.creditAmountCents;
  const amount = input.overrideAmountCents ?? policyAmount;
  if (input.destination === 'original_method' && !result.refundEligible && input.overrideAmountCents == null) {
    throw new Error(`Not refund-eligible to original method: ${result.ruleText} (override to force, or use Credit on Account).`);
  }

  // Withdraw the registration (advances the waitlist behind it).
  await withdrawRegistration(input.registrationId, input.actorClerkId);

  if (amount > 0 && input.destination === 'credit_on_account' && ctx.familyId) {
    await db.rpc('credit_apply', { p_family_id: ctx.familyId, p_delta: amount, p_reason: 'refund', p_ref: `registration:${input.registrationId}`, p_created_by: input.actorClerkId });
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
    },
  });

  return { amountCents: amount, destination: input.destination, ruleText: result.ruleText };
}
