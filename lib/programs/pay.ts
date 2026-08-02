import 'server-only';
import { audit } from '@ai/foundation';
import { createHostedCheckout, getHostedCheckout } from '@ai/foundation/stripe';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { markProgramInstallmentPaid } from '@/lib/programs/checkout';

/**
 * Family-facing payments (/account/pay). Reads the household's outstanding
 * program installments and pays them through a Stripe-hosted Checkout page —
 * the portal's first client-facing payment surface.
 *
 * Settlement is belt-and-braces: the webhook (payment.succeeded with
 * program_installment_ids metadata — see instrumentation.ts) AND the
 * success-URL return path both call markProgramInstallmentPaid, which is
 * idempotent. The return path matters because STRIPE_WEBHOOK_SECRET may not
 * be configured yet; the webhook matters because users close tabs.
 */

export interface PayableInstallment {
  id: number;
  orderId: number;
  seq: number;
  label: string;
  amountCents: number;
  dueDate: string;
  status: string;
  overdue: boolean;
}

export interface PayableOrder {
  orderId: number;
  programNames: string[];
  status: string;
  totalCents: number;
  owedCents: number;
  paidCount: number;
  totalCount: number;
  installments: PayableInstallment[];
}

export interface HouseholdOutstanding {
  orders: PayableOrder[];
  owedCents: number;
  overdueCents: number;
  nextDue: { amountCents: number; dueDate: string } | null;
}

const UNPAID = ['pending', 'failed'];

/** Everything the household owes on program payment plans, grouped by order. */
export async function householdOutstanding(familyId: number, today: string): Promise<HouseholdOutstanding> {
  const db = supabaseAdmin();
  const { data: orders } = await db
    .from('program_orders')
    .select('id, total_cents, status')
    .eq('family_id', familyId)
    .neq('status', 'cancelled');
  const orderIds = (orders ?? []).map((o) => o.id);
  if (!orderIds.length) return { orders: [], owedCents: 0, overdueCents: 0, nextDue: null };

  const [{ data: insts }, { data: regs }] = await Promise.all([
    db.from('program_installments')
      .select('id, order_id, seq, label, amount_cents, due_date, status')
      .in('order_id', orderIds)
      .order('due_date'),
    db.from('registrations').select('order_id, programs(name)').in('order_id', orderIds),
  ]);

  const namesByOrder = new Map<number, string[]>();
  for (const r of regs ?? []) {
    const name = (r.programs as unknown as { name: string } | null)?.name;
    if (!name || !r.order_id) continue;
    const list = namesByOrder.get(r.order_id) ?? [];
    if (!list.includes(name)) list.push(name);
    namesByOrder.set(r.order_id, list);
  }

  const out: PayableOrder[] = [];
  for (const o of orders ?? []) {
    const rows = (insts ?? []).filter((i) => i.order_id === o.id);
    if (!rows.length) continue;
    const mapped: PayableInstallment[] = rows.map((i) => ({
      id: i.id, orderId: o.id, seq: i.seq, label: i.label,
      amountCents: i.amount_cents, dueDate: i.due_date, status: i.status,
      overdue: UNPAID.includes(i.status) && i.due_date < today,
    }));
    const owed = mapped.filter((i) => UNPAID.includes(i.status)).reduce((a, i) => a + i.amountCents, 0);
    out.push({
      orderId: o.id,
      programNames: namesByOrder.get(o.id) ?? [],
      status: o.status,
      totalCents: o.total_cents,
      owedCents: owed,
      paidCount: mapped.filter((i) => i.status === 'paid').length,
      totalCount: mapped.length,
      installments: mapped,
    });
  }
  // Orders with money owing first, then most recent.
  out.sort((a, b) => (b.owedCents > 0 ? 1 : 0) - (a.owedCents > 0 ? 1 : 0) || b.orderId - a.orderId);

  const unpaidAll = out.flatMap((o) => o.installments).filter((i) => UNPAID.includes(i.status));
  unpaidAll.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return {
    orders: out,
    owedCents: unpaidAll.reduce((a, i) => a + i.amountCents, 0),
    overdueCents: unpaidAll.filter((i) => i.overdue).reduce((a, i) => a + i.amountCents, 0),
    nextDue: unpaidAll[0] ? { amountCents: unpaidAll[0].amountCents, dueDate: unpaidAll[0].dueDate } : null,
  };
}

/**
 * Start a hosted payment for one or more of the household's unpaid
 * installments. Validates ownership + unpaid status server-side; returns the
 * Stripe-hosted page URL to redirect to.
 */
export async function startInstallmentCheckout(input: {
  installmentIds: number[];
  familyId: number;
  origin: string;
  customerId?: string | null;
  actorClerkId: string;
}): Promise<{ url: string }> {
  const ids = [...new Set(input.installmentIds)].filter(Boolean);
  if (!ids.length) throw new Error('Nothing selected to pay.');
  const db = supabaseAdmin();

  const { data: rows, error } = await db
    .from('program_installments')
    .select('id, amount_cents, status, label, program_orders(id, family_id)')
    .in('id', ids);
  if (error) throw new Error(error.message);
  if ((rows ?? []).length !== ids.length) throw new Error('Installment not found.');
  for (const r of rows ?? []) {
    const order = r.program_orders as unknown as { id: number; family_id: number | null };
    if (order?.family_id !== input.familyId) throw new Error('That payment is not on your account.');
    if (!UNPAID.includes(r.status)) throw new Error('That installment is already settled.');
  }

  const amount = (rows ?? []).reduce((a, r) => a + r.amount_cents, 0);
  const label = rows!.length === 1 ? rows![0].label : `${rows!.length} payment plan installments`;
  const session = await createHostedCheckout({
    customerId: input.customerId ?? null,
    amountCents: amount,
    description: `Athlete Institute — ${label}`,
    metadata: {
      program_installment_ids: ids.join(','),
      family_id: String(input.familyId),
    },
    successUrl: `${input.origin}/account/pay?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${input.origin}/account/pay`,
  });
  if (!session.url) throw new Error('Stripe did not return a checkout URL.');

  await audit({
    actorId: input.actorClerkId,
    action: 'program_installment.checkout-started',
    target: `family:${input.familyId}`,
    meta: { installment_ids: ids, amount_cents: amount, stripe_session: session.id },
  });
  return { url: session.url };
}

/**
 * Settle from the success-URL return (?session_id=...). Safe to call with a
 * bogus or unpaid session — it settles only what Stripe confirms paid, and
 * marking is idempotent. Returns the number of installments settled.
 */
export async function settleCheckoutReturn(sessionId: string): Promise<number> {
  let session;
  try {
    session = await getHostedCheckout(sessionId);
  } catch {
    return 0; // bad/foreign id — the webhook remains the source of truth
  }
  if (session.payment_status !== 'paid') return 0;
  const ids = (session.metadata?.program_installment_ids ?? '')
    .split(',').map((s) => Number(s)).filter(Boolean);
  for (const id of ids) await markProgramInstallmentPaid(id, 'system:checkout-return');
  return ids.length;
}
