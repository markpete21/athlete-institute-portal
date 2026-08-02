import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatCAD } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { getRental } from '@/lib/rentals/quotes';
import { PrintButton } from './PrintButton';

export const dynamic = 'force-dynamic';

/**
 * Print-ready rental documents (Module 3 review). One route, three documents:
 *
 *   quote     - the priced offer, before anything is committed
 *   agreement - the confirmed booking, with the payment schedule and terms
 *   invoice   - a single instalment, as a payable document
 *
 * Deliberately a page rather than a generated PDF: the browser's own
 * "Save as PDF" produces a real, selectable, archivable file with no server
 * dependency, and the same URL can be sent to a customer as a link. The screen
 * chrome (AdminShell, buttons) is hidden at print time by .doc-noprint.
 */

type DocType = 'quote' | 'agreement' | 'invoice';

const TZ = 'America/Toronto';
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ, year: 'numeric', month: 'long', day: 'numeric' });
const fmtBlock = (startsAt: string, endsAt: string) => {
  const d = new Date(startsAt).toLocaleDateString('en-CA', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const t = (iso: string) => new Date(iso).toLocaleTimeString('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  return `${d}, ${t(startsAt)}-${t(endsAt)}`;
};

const TITLES: Record<DocType, string> = {
  quote: 'Quote',
  agreement: 'Rental agreement',
  invoice: 'Invoice',
};

export default async function RentalDocumentPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { type?: string; installment?: string };
}) {
  const rentalId = Number(params.id);
  if (!Number.isInteger(rentalId) || rentalId <= 0) notFound();

  const type = (['quote', 'agreement', 'invoice'].includes(searchParams.type ?? '')
    ? searchParams.type
    : 'quote') as DocType;

  const rental = await getRental(rentalId);
  if (!rental) notFound();

  const db = supabaseAdmin();
  const [{ data: installments }, { data: org }] = await Promise.all([
    db
      .from('rental_installments')
      .select('id, seq, label, amount_cents, due_date, is_deposit, status, paid_at')
      .eq('rental_id', rentalId)
      .order('seq'),
    rental.organization_id
      ? db.from('organizations').select('name, billing_email').eq('id', rental.organization_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const schedule = installments ?? [];
  // An invoice document is ONE instalment. Default to the earliest unpaid so
  // the common case ("send them the bill") needs no picking.
  const invoiceId = Number(searchParams.installment) || null;
  const invoice =
    type === 'invoice'
      ? schedule.find((i) => i.id === invoiceId) ?? schedule.find((i) => i.status === 'pending') ?? schedule[0] ?? null
      : null;

  if (type === 'invoice' && !invoice) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="label text-[11px]">Admin · Rentals · #{rental.id}</p>
        <h1 className="mt-2 text-3xl">No invoice yet<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="mt-3 text-body">
          This rental has no payment schedule, so there is nothing to invoice.
          Mark the quote booked to raise the deposit and balance.
        </p>
        <Link href={`/rentals/${rental.id}`} className="btn-ghost btn-sm mt-6 inline-block">Back to the rental</Link>
      </main>
    );
  }

  const docNumber =
    type === 'invoice' && invoice
      ? `INV-${String(rental.id).padStart(5, '0')}-${invoice.seq}`
      : `${type === 'agreement' ? 'AGR' : 'QTE'}-${String(rental.id).padStart(5, '0')}`;

  const billTo = [
    org?.name ?? null,
    rental.contact_name,
    rental.contact_email ?? org?.billing_email ?? null,
    rental.contact_phone,
  ].filter(Boolean) as string[];

  const paidCents = schedule
    .filter((i) => i.status === 'paid')
    .reduce((sum, i) => sum + (i.amount_cents as number), 0);
  const balanceCents = rental.total_cents - paidCents;

  return (
    <main className="doc-page mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <div className="doc-noprint flex flex-wrap items-center gap-2 border-b border-hairline pb-4">
        <Link href={`/rentals/${rental.id}`} className="btn-ghost btn-sm">← Back to the rental</Link>
        <div className="ml-auto flex gap-2">
          {(['quote', 'agreement', 'invoice'] as const).map((t) => (
            <Link
              key={t}
              href={`/rentals/${rental.id}/document?type=${t}`}
              className={t === type ? 'btn-gold btn-sm' : 'btn-ghost btn-sm'}
            >
              {TITLES[t]}
            </Link>
          ))}
          <PrintButton />
        </div>
      </div>

      <p className="doc-noprint text-sm text-silver">
        Use your browser&apos;s print dialog and choose <b>Save as PDF</b> to keep a
        copy or attach it to an email. Everything above this line is hidden in
        the printed document.
      </p>

      {/* ---------------- the document itself ---------------- */}
      <article className="doc-sheet flex flex-col gap-7">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 pb-5" style={{ borderColor: 'var(--accent)' }}>
          <div>
            <p className="text-2xl font-bold tracking-tight text-ink">Athlete Institute</p>
            <p className="mt-1 text-sm text-body">
              Orangeville, Ontario<br />
              athleteinstitute.ca
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-ink">{TITLES[type]}</p>
            <p className="mono mt-1 text-sm text-body">{docNumber}</p>
            <p className="mono text-sm text-body">Issued {fmtDate(new Date().toISOString())}</p>
            {rental.status === 'cancelled' && (
              <p className="mt-1 font-bold" style={{ color: '#b4483c' }}>CANCELLED</p>
            )}
          </div>
        </header>

        <section className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="label text-[10px]">Prepared for</p>
            {billTo.length > 0 ? (
              billTo.map((l, i) => <p key={i} className={i === 0 ? 'font-bold text-ink' : 'text-body'}>{l}</p>)
            ) : (
              <p className="text-body">—</p>
            )}
          </div>
          <div>
            <p className="label text-[10px]">Booking</p>
            <p className="font-bold text-ink">{rental.title}</p>
            {rental.booking_type && <p className="text-body capitalize">{rental.booking_type}</p>}
            {invoice && <p className="text-body">{invoice.label}</p>}
          </div>
        </section>

        {/* Facility time is the substance of quote + agreement; on a
            single-instalment invoice it's reference, so it's collapsed out. */}
        {type !== 'invoice' && (
          <section>
            <p className="label mb-2 text-[10px]">Facility time</p>
            {rental.lines.length === 0 ? (
              <p className="text-body">No dates assigned yet.</p>
            ) : (
              <table className="data-table w-full">
                <thead>
                  <tr><th>Facility</th><th>When</th><th className="text-right">Amount</th></tr>
                </thead>
                <tbody>
                  {rental.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="text-ink">{l.facility_name}</td>
                      <td>{fmtBlock(l.starts_at, l.ends_at)}</td>
                      <td className="mono text-right">{formatCAD(l.line_total_cents)}</td>
                    </tr>
                  ))}
                  {rental.addons.map((a) => (
                    <tr key={`a${a.id}`}>
                      <td className="text-ink">{a.name}</td>
                      <td>{a.pricing_mode === 'flat' ? 'Add-on' : `Add-on × ${a.qty}`}</td>
                      <td className="mono text-right">{formatCAD(a.total_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        <section className="flex justify-end">
          <div className="flex w-full max-w-xs flex-col gap-1">
            {type === 'invoice' && invoice ? (
              <>
                <DocRow label="This instalment" v={formatCAD(invoice.amount_cents as number)} bold />
                <DocRow label="Due" v={fmtDate(`${invoice.due_date}T12:00:00Z`)} />
                <div className="mt-1 border-t border-hairline pt-1">
                  <DocRow label="Rental total" v={formatCAD(rental.total_cents)} />
                  <DocRow label="Paid to date" v={formatCAD(paidCents)} />
                  <DocRow label="Balance" v={formatCAD(balanceCents)} accent />
                </div>
              </>
            ) : (
              <>
                <DocRow label="Subtotal" v={formatCAD(rental.subtotal_cents)} />
                <DocRow label="HST (13%)" v={formatCAD(rental.tax_cents)} />
                <div className="border-t border-hairline pt-1">
                  <DocRow label="Total" v={formatCAD(rental.total_cents)} bold />
                </div>
                <DocRow label={`Deposit (${rental.deposit_pct}%)`} v={formatCAD(rental.deposit_cents)} accent />
                <DocRow label="Balance" v={formatCAD(rental.total_cents - rental.deposit_cents)} />
              </>
            )}
          </div>
        </section>

        {type !== 'quote' && schedule.length > 0 && (
          <section>
            <p className="label mb-2 text-[10px]">Payment schedule</p>
            <table className="data-table w-full">
              <thead>
                <tr><th>Instalment</th><th>Due</th><th className="text-right">Amount</th><th>Status</th></tr>
              </thead>
              <tbody>
                {schedule.map((i) => (
                  <tr key={i.id} style={invoice && i.id === invoice.id ? { fontWeight: 700 } : undefined}>
                    <td className="text-ink">{i.label}</td>
                    <td className="mono">{i.due_date}</td>
                    <td className="mono text-right">{formatCAD(i.amount_cents as number)}</td>
                    <td>{i.status === 'paid' ? `Paid ${i.paid_at ? fmtDate(i.paid_at as string) : ''}` : i.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {rental.notes && (
          <section>
            <p className="label mb-1 text-[10px]">Notes</p>
            <p className="whitespace-pre-line text-body">{rental.notes}</p>
          </section>
        )}

        <footer className="border-t border-hairline pt-4 text-sm text-body">
          {type === 'quote' && (
            <p>
              This quote is an estimate based on the facility time above and is
              not a confirmed booking. Dates are held only once a deposit is
              received. Prices include HST where shown.
            </p>
          )}
          {type === 'agreement' && (
            <p>
              Confirmed booking. The deposit is non-refundable. Cancellations and
              changes must be made in writing. The renter is responsible for the
              conduct of their participants and spectators while on site.
            </p>
          )}
          {type === 'invoice' && (
            <p>
              Please remit by the due date shown. Payments can be made by the
              method on file or by arrangement with the office. HST is included
              in the rental total.
            </p>
          )}
          <p className="mt-3 mono text-xs text-silver">
            {docNumber} · Rental #{rental.id} · Athlete Institute, Orangeville ON
          </p>
        </footer>
      </article>
    </main>
  );
}

function DocRow({ label, v, bold, accent }: { label: string; v: string; bold?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-8">
      <span className={bold ? 'font-bold text-ink' : 'text-body'}>{label}</span>
      <span className="mono" style={accent ? { color: 'var(--accent)' } : undefined}>{v}</span>
    </div>
  );
}
