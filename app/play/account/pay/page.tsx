import Link from 'next/link';
import { redirect } from 'next/navigation';
import { formatCAD, torontoToday } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { getPortalSession } from '@/lib/auth';
import { householdOutstanding } from '@/lib/programs/pay';
import { payInstallmentsAction } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Payments (/account/pay) — the household's payment plans and the "Pay now"
 * path the account page's urgent CTA lands on. Payment happens on a
 * Stripe-hosted page; returning with ?session_id settles immediately (the
 * webhook is the backstop for closed tabs).
 */
const dateLabel = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });

export default async function PayPage({ searchParams }: { searchParams: { session_id?: string } }) {
  const session = await getPortalSession();
  if (!session.userId) redirect('/sign-in');
  if (!session.familyId) redirect('/account');

  // Success-URL return: settle what Stripe confirms paid, then show it paid.
  let justSettled = 0;
  if (searchParams.session_id) {
    const { settleCheckoutReturn } = await import('@/lib/programs/pay');
    justSettled = await settleCheckoutReturn(searchParams.session_id);
  }

  const view = await householdOutstanding(session.familyId, torontoToday());
  const { data: fam } = await supabaseAdmin()
    .from('families').select('credit_balance_cents').eq('id', session.familyId).maybeSingle();
  const creditCents = fam?.credit_balance_cents ?? 0;
  const unpaidIds = view.orders.flatMap((o) => o.installments.filter((i) => i.status === 'pending' || i.status === 'failed').map((i) => i.id));

  return (
    <main className="pa-wrap">
      <div className="pa-head">
        <div>
          <p className="label text-[11px]"><Link href="/account" className="pa-inline-link">Account</Link> · Payments</p>
          <h1 className="pa-h1">Payments<span className="pa-dot">.</span></h1>
        </div>
        {view.owedCents > 0 && (
          <form action={payInstallmentsAction}>
            {unpaidIds.map((id) => <input key={id} type="hidden" name="installmentId" value={id} />)}
            <button type="submit" className="btn-gold btn-sm">Pay all · {formatCAD(view.owedCents)}</button>
          </form>
        )}
      </div>

      {justSettled > 0 && (
        <section className="pa-attn" style={{ borderLeftColor: '#3f7a5b' }}>
          <div className="pa-attn-item">
            <span className="pa-attn-txt"><b>Payment received — thank you.</b><span>{justSettled} installment{justSettled === 1 ? '' : 's'} settled. A receipt is on its way from Stripe.</span></span>
          </div>
        </section>
      )}

      <div className="flex flex-wrap gap-3" style={{ marginBottom: 24 }}>
        <div className="card-ink kpi min-w-44 flex-1">
          <span className="kpi-k">Owing now</span>
          <span className="kpi-v">{formatCAD(view.owedCents)}</span>
        </div>
        {view.overdueCents > 0 && (
          <div className="card kpi min-w-44 flex-1">
            <span className="kpi-k" style={{ color: 'var(--accent)' }}>Overdue</span>
            <span className="kpi-v" style={{ color: 'var(--accent)' }}>{formatCAD(view.overdueCents)}</span>
          </div>
        )}
        {view.nextDue && (
          <div className="card kpi min-w-44 flex-1">
            <span className="kpi-k">Next payment</span>
            <span className="kpi-v">{formatCAD(view.nextDue.amountCents)}</span>
            <span className="kpi-d">due {dateLabel(view.nextDue.dueDate)}</span>
          </div>
        )}
        {creditCents > 0 && (
          <div className="card kpi min-w-44 flex-1">
            <span className="kpi-k">Credit on account</span>
            <span className="kpi-v">{formatCAD(creditCents)}</span>
            <span className="kpi-d">applied automatically at your next registration</span>
          </div>
        )}
      </div>

      {view.orders.length === 0 ? (
        <p className="pa-empty">No payment plans yet — nothing owing.</p>
      ) : view.orders.map((o) => (
        <section key={o.orderId} style={{ marginBottom: 26 }}>
          <div className="pa-sec-head">
            <h2 className="pa-h2">{o.programNames.join(', ') || `Order #${o.orderId}`}</h2>
            <span className="pa-note">
              {o.owedCents > 0 ? `${formatCAD(o.owedCents)} remaining` : 'Paid in full'} · {o.paidCount} of {o.totalCount} paid
            </span>
          </div>
          <div className="card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr><th>Payment</th><th>Due</th><th>Amount</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {o.installments.map((i) => (
                  <tr key={i.id}>
                    <td className="text-ink">{i.label}</td>
                    <td className="mono">{dateLabel(i.dueDate)}</td>
                    <td className="mono">{formatCAD(i.amountCents)}</td>
                    <td>
                      {i.status === 'paid' ? <span className="pill-status pos">Paid</span>
                        : i.status === 'failed' ? <span className="pill-status neg">Failed — retry</span>
                        : i.overdue ? <span className="pill-status gold">Overdue</span>
                        : <span className="tag">Scheduled</span>}
                    </td>
                    <td className="text-right">
                      {(i.status === 'pending' || i.status === 'failed') && (
                        <form action={payInstallmentsAction}>
                          <input type="hidden" name="installmentId" value={i.id} />
                          <button type="submit" className={i.overdue || i.status === 'failed' ? 'btn-gold btn-sm' : 'btn-ghost btn-sm'}>Pay now</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <p className="pa-note">
        Payments are processed securely by Stripe. Need to change a payment plan
        or pay another way (e-transfer, in person)? Contact the front desk and
        we&apos;ll sort it out.
      </p>
    </main>
  );
}
