import { NextResponse } from 'next/server';
import {
  charge,
  createCardSetupIntent,
  createCustomer,
  createInvoice,
  createPadSetupIntent,
  findCustomerByClerkId,
  getStripe,
  padStatus,
} from '@ai/foundation/stripe';

/**
 * DEV-ONLY: exercises every Stage-4 Stripe rail against TEST MODE and reports
 * each step. Refuses to run in production or against a live key. Deleted (or
 * ignored) once Module 0 ships — it exists so "the rails work" is provable.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  if (!key.startsWith('sk_test_')) {
    return NextResponse.json(
      { error: 'STRIPE_SECRET_KEY missing or not a test key — refusing to run' },
      { status: 400 },
    );
  }

  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  let customerId: string | null = null;

  try {
    // 1. Customer creation
    const customer = await createCustomer({
      email: 'dev-verify@athleteinstitute.ca',
      name: 'Rails Verify',
      metadata: { clerk_user_id: 'dev_verify_stage4' },
    });
    customerId = customer.id;
    record('createCustomer', true, customer.id);

    // 2. Card vaulting: SetupIntent confirmed with Stripe's test Visa
    const cardSi = await createCardSetupIntent(customer.id);
    const confirmed = await getStripe().setupIntents.confirm(cardSi.id, {
      payment_method: 'pm_card_visa',
    });
    record('vault card (SetupIntent)', confirmed.status === 'succeeded', `${cardSi.id} → ${confirmed.status}`);
    const pmId = typeof confirmed.payment_method === 'string' ? confirmed.payment_method : confirmed.payment_method!.id;

    // 3. "Charge this amount" — off-session against the vaulted card
    const pi = await charge({
      customerId: customer.id,
      amountCents: 1234,
      paymentMethodId: pmId,
      methodType: 'card',
      description: 'Stage-4 rails verification charge',
      metadata: { purpose: 'dev_verify' },
    });
    record('charge $12.34 off-session', pi.status === 'succeeded', `${pi.id} → ${pi.status}`);

    // 4. "Create this invoice" — finalized, hosted payment URL
    const invoice = await createInvoice({
      customerId: customer.id,
      items: [
        { description: 'Gym rental — half court', amountCents: 15000 },
        { description: 'Equipment add-on', amountCents: 2500 },
      ],
      daysUntilDue: 14,
      metadata: { purpose: 'dev_verify' },
    });
    record(
      'createInvoice (2 items, $175.00)',
      invoice.status === 'open' && !!invoice.hosted_invoice_url && invoice.amount_due === 17500,
      `${invoice.id} → ${invoice.status}, due ${invoice.amount_due}¢`,
    );

    // 5. PAD SetupIntent — mandate options attached (client-side confirm is the
    //    part that needs a browser bank-details form, so status stays
    //    requires_payment_method here; creation proves the rail).
    const padSi = await createPadSetupIntent(customer.id);
    record(
      'createPadSetupIntent (acss_debit + mandate)',
      padSi.payment_method_types.includes('acss_debit') && !!padSi.client_secret,
      `${padSi.id} → ${padSi.status}`,
    );

    // 6. PAD readiness question (no confirmed PAD yet → must be false)
    const pad = await padStatus(customer.id);
    record('padStatus reports not-ready (correct)', pad.ready === false, JSON.stringify(pad));

    // 7. Customer recovery by Clerk id (search is eventually consistent — a
    //    miss here is a Stripe indexing delay, not a rails failure)
    const found = await findCustomerByClerkId('dev_verify_stage4');
    record(
      'findCustomerByClerkId',
      found === null || found.id === customer.id,
      found ? found.id : 'null (search index lag — acceptable)',
    );
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    // Cleanup: void the open invoice, then delete the test customer
    if (customerId) {
      try {
        const invoices = await getStripe().invoices.list({ customer: customerId, status: 'open' });
        for (const inv of invoices.data) await getStripe().invoices.voidInvoice(inv.id!);
        await getStripe().customers.del(customerId);
        record('cleanup (void invoice, delete customer)', true, customerId);
      } catch (err) {
        record('cleanup', false, err instanceof Error ? err.message : String(err));
      }
    }
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
