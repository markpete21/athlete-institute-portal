import 'server-only';
import { clerkClient, currentUser } from '@clerk/nextjs/server';
import { createCustomer, findCustomerByClerkId } from '@ai/foundation/stripe';

/**
 * Clerk ↔ Stripe binding: one Stripe customer per account, id cached in Clerk
 * privateMetadata. (Module 1's `profiles` table becomes the durable home for
 * this mapping; the cache + `metadata.clerk_user_id` on the Stripe side make
 * that migration a backfill, not a re-vault.)
 */
const STRIPE_CUSTOMER_KEY = 'stripeCustomerId';

/** Get (or create once) the Stripe customer for the signed-in user. */
export async function getOrCreateStripeCustomerId(): Promise<string> {
  const user = await currentUser();
  if (!user) throw new Error('getOrCreateStripeCustomerId(): no signed-in user');

  const cached = user.privateMetadata?.[STRIPE_CUSTOMER_KEY];
  if (typeof cached === 'string' && cached.length > 0) return cached;

  // Not cached — recover an existing customer (metadata search) before
  // creating, so re-runs and cache wipes never duplicate customers.
  const email = user.primaryEmailAddress?.emailAddress;
  if (!email) throw new Error('getOrCreateStripeCustomerId(): user has no email');

  const existing = await findCustomerByClerkId(user.id);
  const customer =
    existing ??
    (await createCustomer({
      email,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
      metadata: { clerk_user_id: user.id },
    }));

  const clerk = await clerkClient();
  await clerk.users.updateUserMetadata(user.id, {
    privateMetadata: { [STRIPE_CUSTOMER_KEY]: customer.id },
  });
  return customer.id;
}
