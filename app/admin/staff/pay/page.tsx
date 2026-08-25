import Link from 'next/link';
import { biWeeklyPeriod, formatCAD, shiftPeriod, torontoToday } from '@ai/foundation';
import { payRows } from '@/lib/staff/staff';
import { markPayPaidAction } from '../actions';

export const dynamic = 'force-dynamic';

const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * Staff pay dashboard (Module 5 Stages 5+7): the bi-weekly "who is paid this
 * period" report, owed per staff and per program, upcoming pay dates, paid vs
 * outstanding, QuickBooks CSV export. Tracking only - never moves money.
 */
export default async function PayDashboardPage({ searchParams }: { searchParams: { period?: string } }) {
  const today = torontoToday();
  const basePeriod = biWeeklyPeriod(today);
  const offset = Number(searchParams.period) || 0;
  const period = shiftPeriod(basePeriod, offset);

  const rows = await payRows();
  const inPeriod = rows.filter((r) => r.dueDate >= period.startISO && r.dueDate <= period.endISO);

  const outstanding = rows.filter((i) => i.status === 'outstanding').reduce((a, i) => a + i.amountCents, 0);
  const paid = rows.filter((i) => i.status === 'paid').reduce((a, i) => a + i.amountCents, 0);
  const upcoming = rows.filter((i) => i.status === 'outstanding' && i.dueDate >= today).slice(0, 8);

  const rollup = (key: (r: (typeof rows)[number]) => string) => {
    const m = new Map<string, { owed: number; paid: number }>();
    for (const r of rows) {
      const cur = m.get(key(r)) ?? { owed: 0, paid: 0 };
      if (r.status === 'paid') cur.paid += r.amountCents;
      else cur.owed += r.amountCents;
      m.set(key(r), cur);
    }
    return [...m.entries()].sort((a, b) => b[1].owed - a[1].owed);
  };
  const byStaff = rollup((r) => r.staffName);
  const byProgram = rollup((r) => r.programName);

  const periodTotal = inPeriod.reduce((a, i) => a + i.amountCents, 0);
  const periodPaid = inPeriod.filter((i) => i.status === 'paid').reduce((a, i) => a + i.amountCents, 0);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-hairline pb-6">
        <div>
          <p className="label text-[11px]">Admin · Staff</p>
          <h1 className="text-5xl">Pay<span style={{ color: 'var(--accent)' }}>.</span></h1>
          <p className="text-body mt-2">Tracking only — exports to QuickBooks/payroll; never moves money. Feeds Module 4 program margin.</p>
        </div>
        <Link href="/staff" className="btn-ghost btn-sm">← Staff</Link>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="card kpi"><p className="kpi-k">Outstanding</p><p className="kpi-v" style={{ color: '#b4483c' }}>{formatCAD(outstanding)}</p></div>
        <div className="card kpi"><p className="kpi-k">Paid</p><p className="kpi-v" style={{ color: '#3f7a5b' }}>{formatCAD(paid)}</p></div>
      </section>

      {/* Bi-weekly pay period report */}
      <section className="card flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl">Pay period</h2>
          <span className="mono text-sm">{fmt(period.startISO)} – {fmt(period.endISO)}</span>
          {offset === 0 && <span className="pill-status gold">current</span>}
          <div className="ml-auto flex items-center gap-2">
            <Link href={`/staff/pay?period=${offset - 1}`} className="btn-ghost btn-sm">← Prev</Link>
            {offset !== 0 && <Link href="/staff/pay" className="btn-ghost btn-sm">Today</Link>}
            <Link href={`/staff/pay?period=${offset + 1}`} className="btn-ghost btn-sm">Next →</Link>
            <a href={`/staff/pay/export?from=${period.startISO}&to=${period.endISO}`} className="btn-gold btn-sm">Export CSV (QuickBooks)</a>
          </div>
        </div>
        {inPeriod.length === 0 ? (
          <p className="text-sm text-silver">Nobody is paid in this period.</p>
        ) : (
          <>
            <p className="text-sm text-body">{inPeriod.length} payment{inPeriod.length === 1 ? '' : 's'} · {formatCAD(periodTotal)} total · {formatCAD(periodPaid)} settled</p>
            <table className="data-table">
              <thead><tr><th>Due</th><th>Staff</th><th>Program</th><th>Amount</th><th>Status</th><th /></tr></thead>
              <tbody>
                {inPeriod.map((i) => (
                  <tr key={i.id}>
                    <td className="mono">{fmt(i.dueDate)}</td>
                    <td className="text-ink"><Link href={`/staff/${i.staffId}`} className="hover:underline">{i.staffName}</Link></td>
                    <td>{i.programName}</td>
                    <td className="mono">{formatCAD(i.amountCents)}</td>
                    <td><span className={i.status === 'paid' ? 'pill-status pos' : 'tag'}>{i.status}</span></td>
                    <td>{i.status === 'outstanding' && (
                      <form action={markPayPaidAction}><input type="hidden" name="payDateId" value={i.id} /><button type="submit" className="btn-ghost btn-sm">Mark paid</button></form>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      {upcoming.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-2xl">Upcoming pay dates</h2>
          <div className="flex flex-wrap gap-2">
            {upcoming.map((i) => <span key={i.id} className="tag">{fmt(i.dueDate)} · {i.staffName} · {formatCAD(i.amountCents)}</span>)}
          </div>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl">Per staff</h2>
          <table className="data-table">
            <thead><tr><th>Staff</th><th>Outstanding</th><th>Paid</th></tr></thead>
            <tbody>
              {byStaff.map(([name, v]) => (
                <tr key={name}><td className="text-ink">{name}</td><td className="mono">{formatCAD(v.owed)}</td><td className="mono">{formatCAD(v.paid)}</td></tr>
              ))}
              {byStaff.length === 0 && <tr><td colSpan={3} className="text-silver">No pay scheduled yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl">Per program</h2>
          <table className="data-table">
            <thead><tr><th>Program</th><th>Outstanding</th><th>Paid</th></tr></thead>
            <tbody>
              {byProgram.map(([name, v]) => (
                <tr key={name}><td className="text-ink">{name}</td><td className="mono">{formatCAD(v.owed)}</td><td className="mono">{formatCAD(v.paid)}</td></tr>
              ))}
              {byProgram.length === 0 && <tr><td colSpan={3} className="text-silver">No pay scheduled yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-silver">Program staff cost (owed + paid) feeds the Module 4 margin report. The CSV export maps programs to their QuickBooks class.</p>
    </main>
  );
}
