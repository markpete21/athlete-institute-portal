/**
 * THE CANONICAL PRICING FUNCTION (Module 1 §Discount & Credit Stacking).
 *
 * Every dollar of money math on the platform runs through here — checkout,
 * rentals, program registration, payment plans, refund baselines. No module
 * re-computes pricing; if a module seems to need its own math, EXTEND THIS
 * (master doc golden rule #2).
 *
 * Canonical order, per line:
 *   base price (early-bird already selected by the caller)
 *   → + late registration fee
 *   → − returning-athlete discount   (always applies when enabled — rule 2)
 *   → − multi-member discount
 *   → − scholarship                  (eligible program types only — rule 1)
 * then, pooled across the cart in order (rules 3–5):
 *   → − staff credit  XOR  promo     (never both — rule 3)
 *   → − Credit on Account            (before points — rule 4)
 *   → − Play Points                  (eligible lines only, ≤50% per line — rule 5)
 *
 * Redemption scope (rule 5):
 *   Play Points   program lines only — NOT academy, club, or rentals;
 *                 capped at 50% of the eligible line's price (its subtotal
 *                 after program-level adjustments, before pooled balances);
 *                 100 points = $1 → 1 point = 1 cent.
 *   Scholarship   academy + club only (extensible per-type flag).
 *   Staff credit  program registrations (incl. academy/club), never rentals.
 * No step ever drives a line below zero. All amounts integer CENTS.
 */

export type LineKind = 'program' | 'rental';

/** Program types that take scholarships / are excluded from points, seeded per spec. */
export const SCHOLARSHIP_PROGRAM_TYPES: readonly string[] = ['academy', 'club'];
export const POINTS_EXCLUDED_PROGRAM_TYPES: readonly string[] = ['academy', 'club'];

export const POINTS_PER_DOLLAR = 100; // 100 points = $1 → 1 point = 1 cent
export const POINTS_LINE_CAP_FRACTION = 0.5;

export interface PriceLineInput {
  /** Caller's reference (registration id, rental quote id …). */
  id: string;
  kind: LineKind;
  /** e.g. 'league' | 'camp' | 'academy' | 'club' — drives eligibility defaults. */
  programType?: string;
  /** Base price with early-bird already applied when applicable. */
  basePriceCents: number;
  lateFeeCents?: number;
  /** Only passed when the program has it enabled. Always applies (rule 2). */
  returningAthleteDiscountCents?: number;
  multiMemberDiscountCents?: number;
  /** Scholarship awarded to this registrant (applied only if line is eligible). */
  scholarshipCents?: number;
  /** Eligibility overrides — defaults derived from kind/programType. */
  scholarshipEligible?: boolean;
  pointsEligible?: boolean;
  staffCreditEligible?: boolean;
}

export interface PriceContext {
  /** Remaining staff credit this season (0 if none / not staff). */
  staffCreditCents?: number;
  /** Promo discount in cents (validated upstream). XOR with staff credit. */
  promoCents?: number;
  /** Credit on Account balance available. */
  creditOnAccountCents?: number;
  /** Play Points available (1 point = 1 cent). */
  playPoints?: number;
}

export interface PricedLine {
  id: string;
  kind: LineKind;
  programType: string | null;
  basePriceCents: number;
  lateFeeCents: number;
  returningAthleteDiscountCents: number;
  multiMemberDiscountCents: number;
  scholarshipCents: number; // as APPLIED (0 when ineligible)
  /** Subtotal after program-level adjustments — the "line price" points cap uses. */
  lineSubtotalCents: number;
  staffCreditAppliedCents: number;
  promoAppliedCents: number;
  creditOnAccountAppliedCents: number;
  playPointsApplied: number; // in points (= cents)
  totalCents: number;
}

export interface PriceResult {
  lines: PricedLine[];
  subtotalCents: number;
  staffCreditUsedCents: number;
  promoUsedCents: number;
  creditOnAccountUsedCents: number;
  playPointsUsed: number;
  totalCents: number;
}

const clampNonNeg = (n: number) => Math.max(0, n);

function assertCents(label: string, n: number | undefined): number {
  const v = n ?? 0;
  if (!Number.isInteger(v) || v < 0) {
    throw new Error(`price(): ${label} must be a non-negative integer (cents), got ${v}`);
  }
  return v;
}

function scholarshipEligibleFor(line: PriceLineInput): boolean {
  if (line.scholarshipEligible !== undefined) return line.scholarshipEligible;
  return line.kind === 'program' && SCHOLARSHIP_PROGRAM_TYPES.includes(line.programType ?? '');
}

function pointsEligibleFor(line: PriceLineInput): boolean {
  if (line.pointsEligible !== undefined) return line.pointsEligible;
  return line.kind === 'program' && !POINTS_EXCLUDED_PROGRAM_TYPES.includes(line.programType ?? '');
}

function staffCreditEligibleFor(line: PriceLineInput): boolean {
  if (line.staffCreditEligible !== undefined) return line.staffCreditEligible;
  return line.kind === 'program';
}

/** Compute the priced cart. Throws on staff-credit+promo together (rule 3). */
export function price(lines: PriceLineInput[], context: PriceContext = {}): PriceResult {
  const staffCredit = assertCents('staffCreditCents', context.staffCreditCents);
  const promo = assertCents('promoCents', context.promoCents);
  const creditOnAccount = assertCents('creditOnAccountCents', context.creditOnAccountCents);
  const playPoints = assertCents('playPoints', context.playPoints);

  if (staffCredit > 0 && promo > 0) {
    throw new Error('price(): staff credit and a promo code cannot be combined (rule 3)');
  }

  // Pass 1 — program-level adjustments per line.
  const priced: PricedLine[] = lines.map((line) => {
    const base = assertCents(`line ${line.id} basePriceCents`, line.basePriceCents);
    const late = assertCents(`line ${line.id} lateFeeCents`, line.lateFeeCents);
    const returning = assertCents(`line ${line.id} returningAthleteDiscountCents`, line.returningAthleteDiscountCents);
    const multi = assertCents(`line ${line.id} multiMemberDiscountCents`, line.multiMemberDiscountCents);
    const scholarshipAsk = assertCents(`line ${line.id} scholarshipCents`, line.scholarshipCents);

    let subtotal = base + late;
    const returningApplied = Math.min(returning, subtotal);
    subtotal -= returningApplied;
    const multiApplied = Math.min(multi, subtotal);
    subtotal -= multiApplied;
    const scholarshipApplied = scholarshipEligibleFor(line) ? Math.min(scholarshipAsk, subtotal) : 0;
    subtotal -= scholarshipApplied;
    subtotal = clampNonNeg(subtotal);

    return {
      id: line.id,
      kind: line.kind,
      programType: line.programType ?? null,
      basePriceCents: base,
      lateFeeCents: late,
      returningAthleteDiscountCents: returningApplied,
      multiMemberDiscountCents: multiApplied,
      scholarshipCents: scholarshipApplied,
      lineSubtotalCents: subtotal,
      staffCreditAppliedCents: 0,
      promoAppliedCents: 0,
      creditOnAccountAppliedCents: 0,
      playPointsApplied: 0,
      totalCents: subtotal,
    };
  });

  // Pass 2 — pooled balances, in canonical order, draining across lines.
  let staffCreditLeft = staffCredit;
  let promoLeft = promo;
  let coaLeft = creditOnAccount;
  let pointsLeft = playPoints;

  for (const line of priced) {
    const eligible = staffCreditEligibleFor(lines.find((l) => l.id === line.id)!);
    if (staffCreditLeft > 0 && eligible) {
      const applied = Math.min(staffCreditLeft, line.totalCents);
      line.staffCreditAppliedCents = applied;
      line.totalCents -= applied;
      staffCreditLeft -= applied;
    }
  }
  for (const line of priced) {
    if (promoLeft > 0) {
      const applied = Math.min(promoLeft, line.totalCents);
      line.promoAppliedCents = applied;
      line.totalCents -= applied;
      promoLeft -= applied;
    }
  }
  for (const line of priced) {
    if (coaLeft > 0) {
      const applied = Math.min(coaLeft, line.totalCents);
      line.creditOnAccountAppliedCents = applied;
      line.totalCents -= applied;
      coaLeft -= applied;
    }
  }
  for (const line of priced) {
    const eligible = pointsEligibleFor(lines.find((l) => l.id === line.id)!);
    if (pointsLeft > 0 && eligible) {
      // ≤50% of the line's price (its post-adjustment subtotal), and never
      // more than what's still owed on the line.
      const cap = Math.floor(line.lineSubtotalCents * POINTS_LINE_CAP_FRACTION);
      const applied = Math.min(pointsLeft, cap, line.totalCents);
      line.playPointsApplied = applied;
      line.totalCents -= applied;
      pointsLeft -= applied;
    }
  }

  const sum = (f: (l: PricedLine) => number) => priced.reduce((a, l) => a + f(l), 0);
  return {
    lines: priced,
    subtotalCents: sum((l) => l.lineSubtotalCents),
    staffCreditUsedCents: staffCredit - staffCreditLeft,
    promoUsedCents: promo - promoLeft,
    creditOnAccountUsedCents: creditOnAccount - coaLeft,
    playPointsUsed: playPoints - pointsLeft,
    totalCents: sum((l) => l.totalCents),
  };
}
