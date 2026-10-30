import 'server-only';
import { clerkClient, currentUser } from '@clerk/nextjs/server';
import { createCustomer, findCustomerByClerkId, resolveStripeAccount, type StripeAccountRef } from '@ai/foundation/stripe';
import { DEFAULT_STRIPE_ACCOUNT } from '@ai/foundation';

/**
 * Clerk ↔ Stripe binding: one Stripe customer per account, id cached in Clerk
 * privateMetadata. (Module 1's `profiles` table becomes the durable home for
 * this mapping; the cache + `metadata.clerk_user_id` on the Stripe side make
 * that migration a backfill, not a re-vault.)
 */
const STRIPE_CUSTOMER_KEY = 'stripeCustomerId';

/**
 * A Stripe customer lives in ONE Stripe account, so the cache is per account:
 * the default account keeps the original key, others get `stripeCustomerId:op`.
 */
function cacheKey(account: StripeAccountRef): string {
  const acct = resolveStripeAccount(account);
  return acct === DEFAULT_STRIPE_ACCOUNT ? STRIPE_CUSTOMER_KEY : `${STRIPE_CUSTOMER_KEY}:${acct}`;
}

/** Get (or create once) the Stripe customer for the signed-in user in one account. */
export async function getOrCreateStripeCustomerId(account: StripeAccountRef = DEFAULT_STRIPE_ACCOUNT): Promise<string> {
  const user = await currentUser();
  if (!user) throw new Error('getOrCreateStripeCustomerId(): no signed-in user');

  const cached = user.privateMetadata?.[cacheKey(account)];
  if (typeof cached === 'string' && cached.length > 0) return cached;

  // Not cached — recover an existing customer (metadata search) before
  // creating, so re-runs and cache wipes never duplicate customers.
  const email = user.primaryEmailAddress?.emailAddress;
  if (!email) throw new Error('getOrCreateStripeCustomerId(): user has no email');

  const existing = await findCustomerByClerkId(user.id, account);
  const customer =
    existing ??
    (await createCustomer({
      email,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
      metadata: { clerk_user_id: user.id },
      account,
    }));

  const clerk = await clerkClient();
  await clerk.users.updateUserMetadata(user.id, {
    privateMetadata: { [cacheKey(account)]: customer.id },
  });
  return customer.id;
}
