import { formatCAD } from '@ai/foundation';
import { PrintButton } from '@/components/PrintButton';
import { getRentalByToken } from '@/lib/rentals/quotes';

export const dynamic = 'force-dynamic';

const TZ = 'America/Toronto';
const fmtBlock = (startsAt: string, endsAt: string) => {
  const d = new Date(startsAt).toLocaleDateString('en-CA', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const t = (iso: string) => new Date(iso).toLocaleTimeString('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  return `${d} · ${t(startsAt)}–${t(endsAt)}`;
};

const STATUS_LABEL: Record<string, string> = {
  quote: 'Quote',
  deposit_due: 'Deposit due',
  balance_due: 'Balance due',
  overdue: 'Overdue',
  paid: 'Paid & confirmed',
  cancelled: 'Cancelled',
};

/**
 * The online quote (Module 3 Stage 2) - the emailed link a customer views.
 * Print-styled: browser Print -> Save as PDF IS the PDF export (brand-styled,
 * documented in the README). Payment actions arrive with Stage 4.
 */
export default async function QuotePage({ params }: { params: { token: string } }) {
  const rental = await getRentalByToken(params.token);

  if (!rental) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-3 px-6">
        <h1 className="text-4xl">Quote not found<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-body">This link may have expired - contact us and we will resend it.</p>
      </main>
    );
  }

  const globalAddons = rental.addons.filter((a) => a.line_id == null);
  const lineAddons = (lineId: number) => rental.addons.filter((a) => a.line_id === lineId);
  const balance = rental.total_cents - rental.deposit_cents;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-14 print:py-6">
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff !important; } }`}</style>

      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <p className="label text-[11px]">Athlete Institute · Rental quote</p>
        <h1 className="text-4xl">
          {rental.title}<span style={{ color: 'var(--accent)' }}>.</span>
        </h1>
        <div className="flex items-center gap-3">
          <span className="tag">{STATUS_LABEL[rental.status]}</span>
          {rental.contact_name && <span className="text-sm text-silver">Prepared for {rental.contact_name}</span>}
        </div>
      </header>

      <section className="flex flex-col gap-3">
        {rental.lines.map((line) => (
          <div key={line.id} className="card flex flex-col gap-2 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="font-bold text-ink">{line.facility_name}</p>
                <p className="mono text-sm text-body">{fmtBlock(line.starts_at, line.ends_at)}</p>
              </div>
              <span className="mono text-ink">{formatCAD(line.line_total_cents)}</span>
            </div>
            {lineAddons(line.id).map((a) => (
              <div key={a.id} className="flex items-baseline justify-between border-t border-hairline pt-2 text-sm">
                <span className="text-body">↳ {a.name}{a.pricing_mode !== 'flat' ? ` × ${a.qty}` : ''}</span>
                <span className="mono text-body">{formatCAD(a.total_cents)}</span>
              </div>
            ))}
          </div>
        ))}

        {globalAddons.length > 0 && (
          <div className="card flex flex-col gap-2 p-4">
            <p className="label text-[11px]">Add-ons</p>
            {globalAddons.map((a) => (
              <div key={a.id} className="flex items-baseline justify-between text-sm">
                <span className="text-body">{a.name}{a.pricing_mode !== 'flat' ? ` × ${a.qty}` : ''}</span>
                <span className="mono text-body">{formatCAD(a.total_cents)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card flex flex-col gap-2 p-5">
        <Row label="Subtotal" cents={rental.subtotal_cents} />
        <Row label="HST (13%)" cents={rental.tax_cents} />
        <div className="border-t border-hairline pt-2">
          <Row label="Total" cents={rental.total_cents} bold />
        </div>
        <Row label={`Deposit (${rental.deposit_pct}%)`} cents={rental.deposit_cents} accent />
        <Row label="Balance" cents={balance} />
        <p className="pt-2 text-xs text-silver">
          Deposit due within 5 business days of booking confirmation and is
          non-refundable. Balance per your payment schedule.
        </p>
      </section>

      <div className="no-print flex gap-3">
        <PrintButton />
      </div>

      <footer className="border-t border-hairline pt-4 text-xs text-silver">
        Athlete Institute · Orangeville, ON · athleteinstitute.ca
      </footer>
    </main>
  );
}

function Row({ label, cents, bold, accent }: { label: string; cents: number; bold?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={bold ? 'font-bold text-ink' : 'text-body'}>{label}</span>
      <span className="mono" style={accent ? { color: 'var(--accent)' } : undefined}>
        <strong className={bold ? 'text-ink' : 'font-normal text-body'}>{formatCAD(cents)}</strong>
      </span>
    </div>
  );
}
