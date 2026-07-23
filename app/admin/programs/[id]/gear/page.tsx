import { gearOrderTotals } from '@ai/foundation';
import { buildGearOrder } from '@/lib/programs/gear';
import { PrintButton } from '@/components/PrintButton';

export const dynamic = 'force-dynamic';

/**
 * Aggregated gear order (Module 4 Stage 5) - a 1-page supplier sheet.
 * Browser Print -> Save as PDF is the download; emailGearOrderAction sends it.
 */
export default async function GearOrderPage({ params }: { params: { id: string } }) {
  const { lines, programName } = await buildGearOrder(Number(params.id));
  const totals = gearOrderTotals(lines);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12 print:py-4">
      <style>{`@media print { .no-print { display:none !important } body { background:#fff !important } }`}</style>

      <header className="flex items-baseline justify-between border-b border-hairline pb-4">
        <div>
          <p className="label text-[11px]">Gear order</p>
          <h1 className="text-3xl">{programName}<span style={{ color: 'var(--accent)' }}>.</span></h1>
        </div>
        <div className="no-print"><PrintButton label="Download PDF" /></div>
      </header>

      {lines.length === 0 ? (
        <p className="text-body">No jersey sizes selected yet.</p>
      ) : (
        <table className="data-table">
          <thead><tr><th>Size</th><th>Participants</th><th>Extras</th><th>Order</th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.size}>
                <td className="text-ink font-bold">{l.size}</td>
                <td className="mono">{l.participants}</td>
                <td className="mono">{l.extras}</td>
                <td className="mono text-ink">{l.total}</td>
              </tr>
            ))}
            <tr>
              <td className="font-bold">Total</td>
              <td className="mono">{totals.participants}</td>
              <td className="mono">{totals.extras}</td>
              <td className="mono font-bold text-ink">{totals.total}</td>
            </tr>
          </tbody>
        </table>
      )}

      <p className="text-xs text-silver">Athlete Institute · gear order · generated from active registrations + staff extras buffer.</p>
    </main>
  );
}
