/**
 * Stripe ACCOUNTS (organizations) — PURE, edge-safe.
 *
 * Athlete Institute and Orangeville Prep charge through DIFFERENT Stripe
 * accounts under one Stripe login (OP Assist may get a third). Every program
 * and rental picks the account its money settles in; orders stamp the account
 * they were charged on so the right rails are used for the life of the order.
 *
 * The same ids ('ai' | 'op' | 'opa') are used by the live/tickets/gear repo so
 * reports can line up across apps. Keys live in env; the default account
 * reads the original variable names and the others append a suffix:
 *   STRIPE_SECRET_KEY_OP, STRIPE_WEBHOOK_SECRET_OP, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_OP
 */

export type StripeAccountId = 'ai' | 'op' | 'opa';

export interface StripeAccountDef {
  id: StripeAccountId;
  label: string;
  /** Env var suffix ('' for the default account). */
  suffix: string;
}

export const STRIPE_ACCOUNTS: readonly StripeAccountDef[] = [
  { id: 'ai', label: 'Athlete Institute', suffix: '' },
  { id: 'op', label: 'Orangeville Prep', suffix: '_OP' },
  { id: 'opa', label: 'OP Assist', suffix: '_OPA' },
] as const;

export const DEFAULT_STRIPE_ACCOUNT: StripeAccountId = 'ai';

export function isStripeAccountId(v: unknown): v is StripeAccountId {
  return STRIPE_ACCOUNTS.some((a) => a.id === v);
}

/** Coerce a stored / posted value to a known account id (default when unknown). */
export function normalizeStripeAccount(v: unknown): StripeAccountId {
  return isStripeAccountId(v) ? v : DEFAULT_STRIPE_ACCOUNT;
}

/** Posted form value → column value: '' / unknown → null (= follow the default rule). */
export function stripeAccountOrNull(v: unknown): StripeAccountId | null {
  return isStripeAccountId(v) ? v : null;
}

export function stripeAccountLabel(id: unknown): string {
  return STRIPE_ACCOUNTS.find((a) => a.id === normalizeStripeAccount(id))?.label ?? 'Athlete Institute';
}

/** Env var name for an account, e.g. ('STRIPE_SECRET_KEY', 'op') → STRIPE_SECRET_KEY_OP. */
export function stripeEnvName(base: string, account: unknown): string {
  const suffix = STRIPE_ACCOUNTS.find((a) => a.id === normalizeStripeAccount(account))?.suffix ?? '';
  return `${base}${suffix}`;
}

/** Whether a secret key is configured for this account. */
export function stripeAccountConfigured(account: unknown): boolean {
  return !!process.env[stripeEnvName('STRIPE_SECRET_KEY', account)];
}

/** Account ids with a secret key set (selectable on forms). */
export function configuredStripeAccounts(): StripeAccountId[] {
  return STRIPE_ACCOUNTS.filter((a) => stripeAccountConfigured(a.id)).map((a) => a.id);
}

/**
 * Default account for a brand when a program has no explicit choice:
 * Orangeville Prep programs settle in the OP account; everything else in the
 * Athlete Institute account.
 */
export function accountForBrand(brandKey: string | null | undefined): StripeAccountId {
  return brandKey === 'orangeville-prep' ? 'op' : DEFAULT_STRIPE_ACCOUNT;
}

/** First known candidate wins, else the default. */
export function pickStripeAccount(...candidates: (string | null | undefined)[]): StripeAccountId {
  for (const c of candidates) if (isStripeAccountId(c)) return c;
  return DEFAULT_STRIPE_ACCOUNT;
}

/**
 * The single account a set of rows settles in. Throws when they disagree —
 * one Stripe checkout can only charge one account, so mixed carts must be
 * split by the caller.
 */
export function singleStripeAccount(
  accounts: (string | null | undefined)[],
  what = 'items',
): StripeAccountId {
  const set = new Set(accounts.map((a) => normalizeStripeAccount(a)));
  if (set.size > 1) {
    const labels = [...set].map(stripeAccountLabel).join(' and ');
    throw new Error(`These ${what} settle in different organizations (${labels}) — please pay them separately.`);
  }
  return [...set][0] ?? DEFAULT_STRIPE_ACCOUNT;
}
