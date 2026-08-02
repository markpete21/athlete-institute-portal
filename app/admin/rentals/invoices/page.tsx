import Link from 'next/link';
import { formatCAD } from '@ai/foundation';
import { searchInvoices } from '@/lib/rentals/search';
import { chargeInstallmentAction, recordPaymentAction } from '../actions';

export const dynamic = 'force-dynamic';

const TZ = 'America/Toronto';
const fmtDue = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-CA', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' });

const STATUS_COLOR: Record<string, string> = {
  pending: '#9e8959',
  paid: '#3f7a5b',
  failed: '#b4483c',
  waived: '#9ea1a1',
};

/**
 * Invoices (Module 3 review) - the accounts-receivable view.
 *
 * An "invoice" here is a rental instalment: the deposit and the balance are
 * what actually get billed, whether that happens as a Stripe invoice, a PAD
 * auto-charge or a cheque recorded by hand. Listing instalments rather than
 * Stripe objects means manually-settled money shows up too, so the outstanding
 * figure is the real one.
 */
export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; from?: string; to?: string };
}) {
  const rows = await searchInvoices({
    q: searchParams.q?.trim() || undefined,
    status: searchParams.status || '',
    dueFrom: searchParams.from || undefined,
    dueTo: searchParams.to || undefined,
  });

  const active = !!searchParams.q || !!searchParams.status || !!searchParams.from || !!searchParams.to;
  const owed = rows.filter((r) => r.status === 'pending');
  const owedCents = owed.reduce((s, r) => s + r.amount_cents, 0);
  const overdueCents = rows.filter((r) => r.overdue).reduce((s, r) => s + r.amount_cents, 0);
  const paidCents = rows.filter((r) => r.status === 'paid').reduce((s, r) => s + r.amount_cents, 0);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-5">
        <div>
          <p className="label text-[11px]">Admin · Rentals · Invoices</p>
          <h1 className="text-4xl">
            Invoices<span style={{ color: 'var(--accent)' }}>.</span>
          </h1>
          <p className="mt-1 text-sm text-silver">
            Every deposit and balance instalment across all rentals. Charge,
            record a manual payment, or open the printable invoice.
          </p>
        </div>
        <Link href="/rentals" className="btn-ghost btn-sm">All rentals</Link>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Outstanding" value={formatCAD(owedCents)} sub={`${owed.length} unpaid`} accent />
        <Stat label="Overdue" value={formatCAD(overdueCents)} sub="past the due date" danger={overdueCents > 0} />
        <Stat label="Paid" value={formatCAD(paidCents)} sub="in this view" />
      </div>

      <form method="get" action="/rentals/invoices" className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-56 flex-1">
          <label className="field-label" htmlFor="q">Search</label>
          <input
            id="q" name="q" defaultValue={searchParams.q ?? ''}
            placeholder="Rental, contact, organization, #id…" className="input"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={searchParams.status ?? ''} className="input">
            <option value="">Any</option>
            <option value="overdue">Overdue</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="failed">Failed</option>
            <option value="waived">Waived</option>
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="from">Due from</label>
          <input id="from" type="date" name="from" defaultValue={searchParams.from ?? ''} className="input" />
        </div>
        <div>
          <label className="field-label" htmlFor="to">To</label>
          <input id="to" type="date" name="to" defaultValue={searchParams.to ?? ''} className="input" />
        </div>
        <button type="submit" className="btn-gold btn-sm">Search</button>
        {active && <Link href="/rentals/invoices" className="btn-ghost btn-sm">Clear</Link>}
      </form>

      {rows.length === 0 ? (
        <p className="card p-8 text-center text-body">
          {active ? 'Nothing matches those filters.' : 'No instalments raised yet.'}
        </p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Rental</th><th>Instalment</th><th>Billed to</th>
              <th>Due</th><th className="text-right">Amount</th><th>Status</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="text-ink">
                  <Link href={`/rentals/${r.rental_id}`} className="hover:underline">{r.rental_title}</Link>
                  <span className="mono ml-2 text-[10px] text-silver">#{r.rental_id}</span>
                </td>
                <td>
                  {r.label}
                  {r.is_deposit && <span className="tag ml-2">deposit</span>}
                </td>
                <td>{r.organization_name ?? r.contact_name ?? '—'}</td>
                <td className="mono" style={r.overdue ? { color: '#b4483c', fontWeight: 700 } : undefined}>
                  {fmtDue(r.due_date)}
                </td>
                <td className="mono text-right">{formatCAD(r.amount_cents)}</td>
                <td>
                  <span
                    className="tag"
                    style={
                      r.overdue
                        ? { color: '#b4483c', borderColor: '#b4483c' }
                        : { color: STATUS_COLOR[r.status], borderColor: STATUS_COLOR[r.status] }
                    }
                  >
                    {r.overdue ? 'overdue' : r.status}
                  </span>
                </td>
                <td className="flex flex-wrap gap-1">
                  <Link
                    href={`/rentals/${r.rental_id}/document?type=invoice&installment=${r.id}`}
                    className="btn-ghost btn-sm"
                  >
                    Invoice
                  </Link>
                  {r.status === 'pending' && (
                    <>
                      <form action={chargeInstallmentAction}>
                        <input type="hidden" name="rentalId" value={r.rental_id} />
                        <input type="hidden" name="installmentId" value={r.id} />
                        <button type="submit" className="btn-ghost btn-sm">Charge</button>
                      </form>
                      <form action={recordPaymentAction}>
                        <input type="hidden" name="rentalId" value={r.rental_id} />
                        <input type="hidden" name="installmentId" value={r.id} />
                        <button type="submit" className="btn-ghost btn-sm">Record paid</button>
                      </form>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

function Stat({
  label, value, sub, accent, danger,
}: { label: string; value: string; sub: string; accent?: boolean; danger?: boolean }) {
  return (
    <div className="card flex flex-col gap-0.5 p-4">
      <span className="label text-[10px]">{label}</span>
      <span
        className="mono text-2xl font-bold"
        style={danger ? { color: '#b4483c' } : accent ? { color: 'var(--accent)' } : undefined}
      >
        {value}
      </span>
      <span className="text-[11px] text-silver">{sub}</span>
    </div>
  );
}
