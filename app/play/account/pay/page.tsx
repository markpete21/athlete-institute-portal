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
        <section className="pa-attn" style={{ borderLeftColor: '#2e7d4f' }}>
          <div className="pa-attn-item">
            <span className="pa-attn-txt"><b>Payment received — thank you.</b><span>{justSettled} installment{justSettled === 1 ? '' : 's'} settled. A receipt is on its way from Stripe.</span></span>
          </div>
        </section>
      )}

      <div className="card pa-panel" style={{ marginBottom: 24, flexDirection: 'row', display: 'flex', gap: 34, flexWrap: 'wrap' }}>
        <div>
          <p className="label text-[10px]">Owing now</p>
          <p className="pa-big">{formatCAD(view.owedCents)}</p>
        </div>
        {view.overdueCents > 0 && (
          <div>
            <p className="label text-[10px]" style={{ color: 'var(--accent)' }}>Overdue</p>
            <p className="pa-big" style={{ color: 'var(--accent)' }}>{formatCAD(view.overdueCents)}</p>
          </div>
        )}
        {view.nextDue && (
          <div>
            <p className="label text-[10px]">Next payment</p>
            <p className="pa-big">{formatCAD(view.nextDue.amountCents)}</p>
            <p className="pa-note">due {dateLabel(view.nextDue.dueDate)}</p>
          </div>
        )}
        {creditCents > 0 && (
          <div>
            <p className="label text-[10px]">Credit on account</p>
            <p className="pa-big">{formatCAD(creditCents)}</p>
            <p className="pa-note">applied automatically at your next registration</p>
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
                    <span className="tag" style={i.overdue || i.status === 'failed' ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}>
                      {i.status === 'paid' ? 'Paid' : i.status === 'failed' ? 'Failed — retry' : i.overdue ? 'Overdue' : 'Scheduled'}
                    </span>
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
