'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getPortalSession } from '@/lib/auth';
import { startInstallmentCheckout } from '@/lib/programs/pay';

/** The play host's origin, rebuilt from the request (dev-safe). */
function requestOrigin(): string {
  const h = headers();
  const host = h.get('host') ?? 'play.athleteinstitute.ca';
  const proto = host.includes('localhost') ? 'http' : 'https';
  return `${proto}://${host}`;
}

/**
 * Redirect to a Stripe-hosted page for the selected installments. Suspended
 * accounts may still PAY (we want money owed to be payable) — suspension
 * blocks new registrations, not settling a balance.
 */
export async function payInstallmentsAction(formData: FormData): Promise<void> {
  const session = await getPortalSession();
  if (!session.userId || !session.familyId) throw new Error('Sign in first.');

  const ids = formData.getAll('installmentId').map((v) => Number(v)).filter(Boolean);

  // Attach the payment to the household's Stripe customer when possible so
  // the card is reusable later; a missing email just means a guest payment.
  let customerId: string | null = null;
  try {
    const { getOrCreateStripeCustomerId } = await import('@/lib/billing');
    customerId = await getOrCreateStripeCustomerId();
  } catch { /* guest checkout is fine */ }

  const { url } = await startInstallmentCheckout({
    installmentIds: ids,
    familyId: session.familyId,
    origin: requestOrigin(),
    customerId,
    actorClerkId: session.userId,
  });
  redirect(url);
}
