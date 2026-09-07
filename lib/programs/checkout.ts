import 'server-only';
import {
  audit,
  equalInstallments,
  price,
  torontoToday,
  type PriceLineInput,
  type PriceResult,
} from '@ai/foundation';
import { must, ok, rows, supabaseAdmin } from '@ai/foundation/supabase';
import { programType } from '@/lib/programs/types';
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
  family_member_id: number | null;
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

async function loadRegs(registrationIds: number[], familyId?: number | null): Promise<RegRow[]> {
  const { data, error } = await supabaseAdmin()
    .from('registrations')
    .select('id, program_id, family_id, family_member_id, standing, refund_insurance, programs(program_types(key), base_price_cents, early_bird_price_cents, early_bird_until, late_fee_cents, late_fee_after, returning_discount_cents, multi_member_discount_cents, scholarship_eligible)')
    .in('id', registrationIds);
  if (error) throw new Error(error.message);
  // One order = one household. A cart that somehow mixes families would let
  // one family's balances pay for another's registrations.
  const families = new Set((data ?? []).map((r) => r.family_id).filter((f): f is number => f != null));
  if (families.size > 1) throw new Error('These registrations belong to different households.');
  if (familyId != null && families.size && !families.has(familyId)) throw new Error('Those registrations are not in your household.');
  return (data ?? []).map((r) => {
    const p = r.programs as unknown as {
      program_types: { key: string };
      base_price_cents: number; early_bird_price_cents: number | null; early_bird_until: string | null;
      late_fee_cents: number; late_fee_after: string | null; returning_discount_cents: number | null;
      multi_member_discount_cents: number; scholarship_eligible: boolean;
    };
    return {
      id: r.id, program_id: r.program_id, family_id: r.family_id, family_member_id: r.family_member_id, standing: r.standing, refund_insurance: r.refund_insurance,
      type_key: p.program_types.key,
      base_price_cents: p.base_price_cents, early_bird_price_cents: p.early_bird_price_cents, early_bird_until: p.early_bird_until,
      late_fee_cents: p.late_fee_cents, late_fee_after: p.late_fee_after, returning_discount_cents: p.returning_discount_cents,
      multi_member_discount_cents: p.multi_member_discount_cents, scholarship_eligible: p.scholarship_eligible,
    };
  });
}

/**
 * Build the Module 1 price lines from registrations (program pricing rules
 * applied). The multi-member discount rewards a second CHILD, not a second
 * program: it applies to lines whose family member differs from the first
 * distinct member in the order.
 */
export function buildPriceLines(regs: RegRow[], today: string, scholarshipByReg: Record<number, number> = {}): PriceLineInput[] {
  const firstMember = regs.find((r) => r.family_member_id != null)?.family_member_id ?? null;
  return regs.map((r) => {
    const additionalMember = firstMember != null && r.family_member_id != null && r.family_member_id !== firstMember;
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
      multiMemberDiscountCents: additionalMember ? r.multi_member_discount_cents : 0,
      scholarshipCents: scholarshipByReg[r.id] ?? 0,
      scholarshipEligible: r.scholarship_eligible,
    };
  });
}

export interface CheckoutContext {
  /** The caller's household; when given, every registration must belong to it. */
  familyId?: number | null;
  promoCents?: number;
  staffCreditCents?: number;
  /** Resolve + apply the household's staff season credit automatically. */
  useStaffCredit?: boolean;
  useCreditOnAccount?: boolean;
  usePlayPoints?: boolean;
  scholarshipByReg?: Record<number, number>;
}

export interface PriceQuote extends PriceResult {
  earnablePoints: number; // points that WOULD be earned (1 per $1 eligible spend)
  /** Whose staff-credit account funds staffCreditUsedCents (null = none). */
  staffProfileId: number | null;
}

/**
 * The household's spendable staff credit: a staff-type profile in the family
 * with staff discounts enabled. Reading the account IS the season top-up
 * (ensureSeasonCredit lazily resets the balance to cap on rollover).
 */
async function resolveStaffCredit(familyId: number): Promise<{ profileId: number; balanceCents: number } | null> {
  const db = supabaseAdmin();
  const { data: staffProfiles } = await db
    .from('profiles')
    .select('id, settings')
    .eq('family_id', familyId)
    .eq('user_type', 'staff')
    .eq('status', 'active');
  for (const p of staffProfiles ?? []) {
    const settings = (p.settings ?? {}) as { staffDiscountsEnabled?: boolean };
    if (settings.staffDiscountsEnabled === false) continue; // default is enabled
    const { ensureSeasonCredit } = await import('@/lib/credits');
    const state = await ensureSeasonCredit(p.id);
    if (state.balanceCents > 0) return { profileId: p.id, balanceCents: state.balanceCents };
  }
  return null;
}

/** Price a set of registrations WITHOUT persisting (the checkout preview). */
export async function quoteCheckout(registrationIds: number[], ctx: CheckoutContext = {}): Promise<PriceQuote> {
  const regs = await loadRegs(registrationIds, ctx.familyId);
  const today = torontoToday();
  const family = regs.find((r) => r.family_id)?.family_id ?? null;

  let creditOnAccount = 0;
  let playPoints = 0;
  if (family) {
    const fam = must(await supabaseAdmin().from('families').select('credit_balance_cents, play_points_balance').eq('id', family).maybeSingle(), 'family.balances');
    creditOnAccount = ctx.useCreditOnAccount ? fam.credit_balance_cents : 0;
    playPoints = ctx.usePlayPoints ? fam.play_points_balance : 0;
  }

  let staffCreditCents = ctx.staffCreditCents ?? 0;
  let staffProfileId: number | null = null;
  if (ctx.useStaffCredit && family && !staffCreditCents) {
    const staff = await resolveStaffCredit(family);
    if (staff) {
      staffCreditCents = staff.balanceCents;
      staffProfileId = staff.profileId;
    }
  }

  const lines = buildPriceLines(regs, today, ctx.scholarshipByReg);
  const result = price(lines, {
    staffCreditCents,
    promoCents: ctx.promoCents ?? 0,
    creditOnAccountCents: creditOnAccount,
    playPoints,
  });

  // Points earned = $1 per eligible dollar (program types that earn points, per the registry).
  const eligibleSpend = result.lines
    .filter((l) => l.kind === 'program' && programType(l.programType).earnsPoints)
    .reduce((a, l) => a + l.totalCents, 0);
  return { ...result, earnablePoints: Math.floor(eligibleSpend / 100), staffProfileId };
}

export interface OrderAddonInput {
  registrationId?: number | null;
  productId?: number | null;
  variantId?: number | null;
  label: string;
  priceCents: number;
  qty?: number;
}

/** Catalogue variants are priced from product_variants; ad-hoc add-ons keep the caller's price. */
async function priceAddons(addons: OrderAddonInput[]): Promise<OrderAddonInput[]> {
  const variantIds = [...new Set(addons.map((a) => a.variantId).filter((v): v is number => v != null))];
  if (variantIds.length === 0) return addons;
  const variants = rows(await supabaseAdmin().from('product_variants').select('id, price_cents').in('id', variantIds), 'variants.read');
  const priceById = new Map(variants.map((r) => [r.id as number, r.price_cents as number]));
  return addons.map((a) => {
    if (a.variantId == null) return a;
    const catalogue = priceById.get(a.variantId);
    if (catalogue == null) throw new Error(`Unknown product variant ${a.variantId}.`);
    return { ...a, priceCents: catalogue };
  });
}

export interface PlaceOrderInput extends CheckoutContext {
  registrationIds: number[];
  addons?: OrderAddonInput[];  // purchased merch/gear add-ons (fixed price, no discounts/points)
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
  const regs = await loadRegs(input.registrationIds, input.familyId);
  if (regs.length === 0) throw new Error('No registrations to check out.');
  const familyId = regs.find((r) => r.family_id)?.family_id ?? null;

  // Account-status gate: a suspended/archived actor cannot place NEW orders
  // (they can still pay what they owe — /account/pay has no such gate). Staff
  // are exempt so the front desk can transact on a family's behalf.
  const { data: actor } = await db
    .from('profiles')
    .select('status, user_type')
    .eq('clerk_user_id', input.actorClerkId)
    .maybeSingle();
  if (actor && actor.user_type !== 'staff' && actor.status !== 'active') {
    throw new Error('This account cannot register right now — please contact the front desk.');
  }

  // Waiver gate (Stage 6): every distinct program's attached waiver must be
  // signed by the family (one per family per program, 1-yr validity).
  const { isProgramWaiverSatisfied } = await import('@/lib/waivers');
  for (const pid of [...new Set(regs.map((r) => r.program_id))]) {
    if (!(await isProgramWaiverSatisfied(pid, familyId))) {
      throw new Error('A required waiver for this program has not been signed by your household.');
    }
  }

  const quote = await quoteCheckout(input.registrationIds, input);

  // Add-ons: fixed-price merch/gear, added after discounts (no points, per
  // spec). A catalogue variant is priced from the catalogue, never from the
  // caller; only ad-hoc add-ons (no variantId) carry their own price.
  const addons = await priceAddons(input.addons ?? []);
  const addonsCents = addons.reduce((a, x) => a + x.priceCents * (x.qty ?? 1), 0);
  const orderTotal = quote.totalCents + addonsCents;

  const { data: order, error } = await db
    .from('program_orders')
    .insert({
      family_id: familyId,
      cart_id: null,
      promo_code: input.promoCents ? 'PROMO' : null,
      subtotal_cents: quote.subtotalCents + addonsCents,
      staff_credit_cents: quote.staffCreditUsedCents,
      promo_cents: quote.promoUsedCents,
      credit_on_account_cents: quote.creditOnAccountUsedCents,
      play_points_used: quote.playPointsUsed,
      total_cents: orderTotal,
      points_earned: quote.earnablePoints,
      pay_in_full: input.payInFull ?? true,
      status: orderTotal === 0 ? 'paid' : input.payInFull === false && (input.installmentCount ?? 1) > 1 ? 'plan_active' : 'pending',
      created_by: input.actorClerkId,
    })
    .select('id')
    .single();
  if (error) throw new Error(`order create failed: ${error.message}`);
  const orderId = order.id as number;

  if (addons.length) {
    const { error: aErr } = await db.from('order_addons').insert(
      addons.map((x) => ({ order_id: orderId, registration_id: x.registrationId ?? null, product_id: x.productId ?? null, variant_id: x.variantId ?? null, label: x.label, price_cents: x.priceCents, qty: x.qty ?? 1 })),
    );
    if (aErr) throw new Error(`add-ons save failed: ${aErr.message}`);
  }

  // Staff credit draws down the staff member's season account (atomic RPC).
  if (quote.staffCreditUsedCents > 0 && quote.staffProfileId) {
    const { spendStaffCredit } = await import('@/lib/credits');
    await spendStaffCredit(quote.staffProfileId, quote.staffCreditUsedCents, input.actorClerkId, `order:${orderId}`);
  }

  // Spend the household balances atomically (never overdraw — the RPCs raise).
  // A raised deduction must not leave a discounted order behind: the order is
  // cancelled and the error surfaces to the caller.
  if (familyId) {
    try {
      if (quote.creditOnAccountUsedCents > 0) {
        ok(
          await db.rpc('credit_apply', { p_family_id: familyId, p_delta: -quote.creditOnAccountUsedCents, p_reason: 'checkout.redeem', p_ref: `order:${orderId}`, p_created_by: input.actorClerkId }),
          'checkout.credit-on-account',
        );
      }
      if (quote.playPointsUsed > 0) {
        await applyPlayPoints(familyId, -quote.playPointsUsed, 'checkout.redeem', input.actorClerkId, `order:${orderId}`);
      }
    } catch (err) {
      await db.from('program_orders').update({ status: 'cancelled' }).eq('id', orderId);
      throw err;
    }
    // Earn points on eligible spend (Module 19 rule: programs only).
    if (quote.earnablePoints > 0) {
      await applyPlayPoints(familyId, quote.earnablePoints, 'checkout.earn', input.actorClerkId, `order:${orderId}`);
    }
  }

  // Link registrations + snapshot each line total (refunds are computed from it).
  await Promise.all(
    quote.lines.map((l) =>
      db.from('registrations').update({ order_id: orderId, line_total_cents: l.totalCents }).eq('id', Number(l.id)).then((r) => ok(r, 'checkout.link-registration')),
    ),
  );

  // Installment schedule (on the order total incl. add-ons).
  const today = torontoToday();
  const schedule =
    orderTotal === 0
      ? []
      : input.payInFull === false && (input.installmentCount ?? 1) > 1
        ? equalInstallments(orderTotal, input.installmentCount!, input.firstDueDate ?? today, input.intervalDays ?? 30)
        : [{ seq: 1, label: 'Payment', amount_cents: orderTotal, due_date: today, is_deposit: false }];
  if (schedule.length) {
    const { error: iErr } = await db.from('program_installments').insert(
      schedule.map((s) => ({ order_id: orderId, seq: s.seq, label: s.label, amount_cents: s.amount_cents, due_date: s.due_date })),
    );
    if (iErr) throw new Error(`schedule create failed: ${iErr.message}`);
  }

  await audit({ actorId: input.actorClerkId, action: 'program_order.placed', target: `program_order:${orderId}`, meta: { total: quote.totalCents, installments: schedule.length, pointsEarned: quote.earnablePoints } });

  // Module 19 hooks: a placed (paid) order is the referral-reward trigger and
  // may unlock loyalty milestones. Best-effort - never blocks checkout.
  if (familyId) {
    try {
      const { awardLoyaltyMilestones, onFirstPaidRegistration } = await import('@/lib/points/points');
      await onFirstPaidRegistration(familyId);
      await awardLoyaltyMilestones(familyId);
    } catch { /* points hooks are non-critical */ }
  }
  return { orderId, quote };
}

/**
 * Recalculate total owed - accounts for missed invoices (catches a plan up).
 * Returns the outstanding balance and marks the order overdue if any
 * installment is past due, paid if all settled.
 */
export async function recalculateOwed(orderId: number): Promise<{ owedCents: number; status: string }> {
  const db = supabaseAdmin();
  const order = must(await db.from('program_orders').select('status').eq('id', orderId).maybeSingle(), 'order.read');
  const insts = rows(await db.from('program_installments').select('amount_cents, status, due_date').eq('order_id', orderId), 'installments.read');
  const today = torontoToday();
  const owed = insts.filter((i) => i.status !== 'paid' && i.status !== 'waived').reduce((a, i) => a + i.amount_cents, 0);
  if (order.status === 'cancelled') return { owedCents: owed, status: 'cancelled' }; // a cancelled order stays cancelled
  const anyOverdue = insts.some((i) => (i.status === 'pending' && i.due_date < today) || i.status === 'failed');
  const status = owed === 0 ? 'paid' : anyOverdue ? 'overdue' : insts.length > 1 ? 'plan_active' : 'pending';
  ok(await db.from('program_orders').update({ status }).eq('id', orderId), 'order.status');
  return { owedCents: owed, status };
}

/**
 * Record an installment paid (manual/e-transfer, webhook, or checkout-return).
 * Idempotent — an already-paid installment is a no-op, so the webhook and the
 * success-URL return path can both fire without double audit rows.
 */
export async function markProgramInstallmentPaid(installmentId: number, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: inst } = await db.from('program_installments').select('order_id, status').eq('id', installmentId).maybeSingle();
  if (!inst || inst.status === 'paid') return;
  // Precondition on the current status: a webhook and the success-URL return
  // racing each other settle exactly once.
  const flipped = rows(
    await db.from('program_installments').update({ status: 'paid', paid_at: new Date().toISOString(), failure_reason: null })
      .eq('id', installmentId).neq('status', 'paid').select('id'),
    'installment.paid',
  );
  if (!flipped.length) return;
  await audit({ actorId: actorClerkId, action: 'program_installment.paid', target: `program_installment:${installmentId}` });
  await recalculateOwed(inst.order_id);
  // A payment at any point closes the dunning case (Module 18) — otherwise the
  // escalation ladder keeps emailing a family that has already paid.
  const { markRecovered } = await import('@/lib/dunning/dunning');
  await markRecovered(installmentId).catch((err) => console.error('[dunning] markRecovered failed:', err));
}

/** Record an installment failed (webhook) — dunning (M18) sweeps these up. */
export async function markProgramInstallmentFailed(installmentId: number, reason: string, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: inst } = await db.from('program_installments').select('order_id, status').eq('id', installmentId).maybeSingle();
  if (!inst || inst.status === 'paid' || inst.status === 'waived') return; // never fail-over a settled/waived payment
  ok(await db.from('program_installments').update({ status: 'failed', failure_reason: reason }).eq('id', installmentId).in('status', ['pending', 'failed']), 'installment.failed');
  await audit({ actorId: actorClerkId, action: 'program_installment.failed', target: `program_installment:${installmentId}`, meta: { reason } });
  await recalculateOwed(inst.order_id);
}
