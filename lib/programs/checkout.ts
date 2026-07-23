import 'server-only';
import {
  audit,
  equalInstallments,
  price,
  torontoToday,
  type PriceLineInput,
  type PriceResult,
} from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { applyPlayPoints } from '@/lib/credits';

/**
 * Program checkout (Module 4 Stage 4). Builds price lines from reserved
 * registrations, runs the SINGLE Module 1 pricing function (early-bird / late
 * fee / returning-athlete / multi-member / scholarship / staff-credit XOR
 * promo / Credit on Account / Play Points), then persists an order + payment
 * plan and earns Play Points on eligible program spend.
 *
 * Distinct balances: Credit on Account (household dollars, from refunds) and
 * Play Points (loyalty, 100=$1) are separate columns/ledgers, both usable at
 * checkout, in the canonical order the pricing function enforces.
 */

interface RegRow {
  id: number;
  program_id: number;
  family_id: number | null;
  standing: string | null;
  refund_insurance: boolean;
  type_key: string;
  base_price_cents: number;
  early_bird_price_cents: number | null;
  early_bird_until: string | null;
  late_fee_cents: number;
  late_fee_after: string | null;
  returning_discount_cents: number | null;
  multi_member_discount_cents: number;
  scholarship_eligible: boolean;
}

async function loadRegs(registrationIds: number[]): Promise<RegRow[]> {
  const { data, error } = await supabaseAdmin()
    .from('registrations')
    .select('id, program_id, family_id, standing, refund_insurance, programs(program_types(key), base_price_cents, early_bird_price_cents, early_bird_until, late_fee_cents, late_fee_after, returning_discount_cents, multi_member_discount_cents, scholarship_eligible)')
    .in('id', registrationIds);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const p = r.programs as unknown as {
      program_types: { key: string };
      base_price_cents: number; early_bird_price_cents: number | null; early_bird_until: string | null;
      late_fee_cents: number; late_fee_after: string | null; returning_discount_cents: number | null;
      multi_member_discount_cents: number; scholarship_eligible: boolean;
    };
    return {
      id: r.id, program_id: r.program_id, family_id: r.family_id, standing: r.standing, refund_insurance: r.refund_insurance,
      type_key: p.program_types.key,
      base_price_cents: p.base_price_cents, early_bird_price_cents: p.early_bird_price_cents, early_bird_until: p.early_bird_until,
      late_fee_cents: p.late_fee_cents, late_fee_after: p.late_fee_after, returning_discount_cents: p.returning_discount_cents,
      multi_member_discount_cents: p.multi_member_discount_cents, scholarship_eligible: p.scholarship_eligible,
    };
  });
}

/** Build the Module 1 price lines from registrations (program pricing rules applied). */
export function buildPriceLines(regs: RegRow[], today: string, scholarshipByReg: Record<number, number> = {}): PriceLineInput[] {
  return regs.map((r, idx) => {
    const earlyBird = r.early_bird_price_cents != null && r.early_bird_until != null && today <= r.early_bird_until;
    const late = r.late_fee_after != null && today > r.late_fee_after;
    return {
      id: String(r.id),
      kind: 'program',
      programType: r.type_key, // academy/club excluded from points by the fn
      basePriceCents: earlyBird ? r.early_bird_price_cents! : r.base_price_cents,
      lateFeeCents: late ? r.late_fee_cents : 0,
      returningAthleteDiscountCents:
        r.standing === 'returning_athlete' && r.returning_discount_cents ? r.returning_discount_cents : 0,
      // Multi-member discount: applied to every line after the first.
      multiMemberDiscountCents: idx > 0 ? r.multi_member_discount_cents : 0,
      scholarshipCents: scholarshipByReg[r.id] ?? 0,
      scholarshipEligible: r.scholarship_eligible,
    };
  });
}

export interface CheckoutContext {
  promoCents?: number;
  staffCreditCents?: number;
  useCreditOnAccount?: boolean;
  usePlayPoints?: boolean;
  scholarshipByReg?: Record<number, number>;
}

export interface PriceQuote extends PriceResult {
  earnablePoints: number; // points that WOULD be earned (1 per $1 eligible spend)
}

/** Price a set of registrations WITHOUT persisting (the checkout preview). */
export async function quoteCheckout(registrationIds: number[], ctx: CheckoutContext = {}): Promise<PriceQuote> {
  const regs = await loadRegs(registrationIds);
  const today = torontoToday();
  const family = regs.find((r) => r.family_id)?.family_id ?? null;

  let creditOnAccount = 0;
  let playPoints = 0;
  if (family) {
    const { data: fam } = await supabaseAdmin().from('families').select('credit_balance_cents, play_points_balance').eq('id', family).single();
    creditOnAccount = ctx.useCreditOnAccount ? fam!.credit_balance_cents : 0;
    playPoints = ctx.usePlayPoints ? fam!.play_points_balance : 0;
  }

  const lines = buildPriceLines(regs, today, ctx.scholarshipByReg);
  const result = price(lines, {
    staffCreditCents: ctx.staffCreditCents ?? 0,
    promoCents: ctx.promoCents ?? 0,
    creditOnAccountCents: creditOnAccount,
    playPoints,
  });

  // Points earned = $1 per eligible ($ spent on non-academy/club program lines).
  const excluded = new Set(['academy', 'club']);
  const eligibleSpend = result.lines
    .filter((l) => l.kind === 'program' && !excluded.has((l.programType ?? '')))
    .reduce((a, l) => a + l.totalCents, 0);
  return { ...result, earnablePoints: Math.floor(eligibleSpend / 100) };
}

export interface PlaceOrderInput extends CheckoutContext {
  registrationIds: number[];
  payInFull?: boolean;
  installmentCount?: number;   // when !payInFull
  firstDueDate?: string;       // YYYY-MM-DD
  intervalDays?: number;
  actorClerkId: string;
}

/**
 * Place the order: price, persist, deduct Credit on Account + Play Points
 * atomically, earn points on eligible spend, and create the installment
 * schedule (pay-in-full = one installment due today).
 */
export async function placeProgramOrder(input: PlaceOrderInput): Promise<{ orderId: number; quote: PriceQuote }> {
  const db = supabaseAdmin();
  const regs = await loadRegs(input.registrationIds);
  if (regs.length === 0) throw new Error('No registrations to check out.');
  const familyId = regs.find((r) => r.family_id)?.family_id ?? null;
  const quote = await quoteCheckout(input.registrationIds, input);

  const { data: order, error } = await db
    .from('program_orders')
    .insert({
      family_id: familyId,
      cart_id: null,
      promo_code: input.promoCents ? 'PROMO' : null,
      subtotal_cents: quote.subtotalCents,
      staff_credit_cents: quote.staffCreditUsedCents,
      promo_cents: quote.promoUsedCents,
      credit_on_account_cents: quote.creditOnAccountUsedCents,
      play_points_used: quote.playPointsUsed,
      total_cents: quote.totalCents,
      points_earned: quote.earnablePoints,
      pay_in_full: input.payInFull ?? true,
      status: quote.totalCents === 0 ? 'paid' : input.payInFull === false ? 'plan_active' : 'pending',
      created_by: input.actorClerkId,
    })
    .select('id')
    .single();
  if (error) throw new Error(`order create failed: ${error.message}`);
  const orderId = order.id as number;

  // Spend the household balances atomically (never overdraw - RPCs guard).
  if (familyId) {
    if (quote.creditOnAccountUsedCents > 0) {
      await db.rpc('credit_apply', { p_family_id: familyId, p_delta: -quote.creditOnAccountUsedCents, p_reason: 'checkout.redeem', p_ref: `order:${orderId}`, p_created_by: input.actorClerkId });
    }
    if (quote.playPointsUsed > 0) {
      await applyPlayPoints(familyId, -quote.playPointsUsed, 'checkout.redeem', input.actorClerkId, `order:${orderId}`);
    }
    // Earn points on eligible spend (Module 19 rule: programs only).
    if (quote.earnablePoints > 0) {
      await applyPlayPoints(familyId, quote.earnablePoints, 'checkout.earn', input.actorClerkId, `order:${orderId}`);
    }
  }

  // Link registrations + snapshot each line total.
  for (const l of quote.lines) {
    await db.from('registrations').update({ order_id: orderId, line_total_cents: l.totalCents }).eq('id', Number(l.id));
  }

  // Installment schedule.
  const today = torontoToday();
  const schedule =
    quote.totalCents === 0
      ? []
      : input.payInFull === false && (input.installmentCount ?? 1) > 1
        ? equalInstallments(quote.totalCents, input.installmentCount!, input.firstDueDate ?? today, input.intervalDays ?? 30)
        : [{ seq: 1, label: 'Payment', amount_cents: quote.totalCents, due_date: today, is_deposit: false }];
  if (schedule.length) {
    const { error: iErr } = await db.from('program_installments').insert(
      schedule.map((s) => ({ order_id: orderId, seq: s.seq, label: s.label, amount_cents: s.amount_cents, due_date: s.due_date })),
    );
    if (iErr) throw new Error(`schedule create failed: ${iErr.message}`);
  }

  await audit({ actorId: input.actorClerkId, action: 'program_order.placed', target: `program_order:${orderId}`, meta: { total: quote.totalCents, installments: schedule.length, pointsEarned: quote.earnablePoints } });
  return { orderId, quote };
}

/**
 * Recalculate total owed - accounts for missed invoices (catches a plan up).
 * Returns the outstanding balance and marks the order overdue if any
 * installment is past due, paid if all settled.
 */
export async function recalculateOwed(orderId: number): Promise<{ owedCents: number; status: string }> {
  const db = supabaseAdmin();
  const { data: insts } = await db.from('program_installments').select('amount_cents, status, due_date').eq('order_id', orderId);
  const today = torontoToday();
  const owed = (insts ?? []).filter((i) => i.status !== 'paid' && i.status !== 'waived').reduce((a, i) => a + i.amount_cents, 0);
  const anyOverdue = (insts ?? []).some((i) => (i.status === 'pending' && i.due_date < today) || i.status === 'failed');
  const status = owed === 0 ? 'paid' : anyOverdue ? 'overdue' : (insts ?? []).length > 1 ? 'plan_active' : 'pending';
  await db.from('program_orders').update({ status }).eq('id', orderId);
  return { owedCents: owed, status };
}

/** Record an installment paid (manual/e-transfer or webhook). */
export async function markProgramInstallmentPaid(installmentId: number, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: inst } = await db.from('program_installments').select('order_id').eq('id', installmentId).single();
  await db.from('program_installments').update({ status: 'paid', paid_at: new Date().toISOString(), failure_reason: null }).eq('id', installmentId);
  await audit({ actorId: actorClerkId, action: 'program_installment.paid', target: `program_installment:${installmentId}` });
  await recalculateOwed(inst!.order_id);
}
