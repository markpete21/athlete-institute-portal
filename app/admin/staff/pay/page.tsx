import { formatCAD } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { markPayPaidAction } from '../actions';

export const dynamic = 'force-dynamic';

const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });

/** Staff pay dashboard (Module 5 Stage 7): owed per staff/program, upcoming, paid vs outstanding. */
export default async function PayDashboardPage() {
  const db = supabaseAdmin();
  const { data: rows } = await db
    .from('staff_pay_dates')
    .select('id, due_date, amount_cents, status, staff_assignments(staff(first_name, last_name), programs(name))')
    .order('due_date');

  const items = (rows ?? []).map((r) => {
    const a = r.staff_assignments as unknown as { staff: { first_name: string; last_name: string } | null; programs: { name: string } | null };
    return { id: r.id, due: r.due_date, amount: r.amount_cents, status: r.status, staff: a?.staff ? `${a.staff.first_name} ${a.staff.last_name}` : '—', program: a?.programs?.name ?? '—' };
  });
  const outstanding = items.filter((i) => i.status === 'outstanding').reduce((a, i) => a + i.amount, 0);
  const paid = items.filter((i) => i.status === 'paid').reduce((a, i) => a + i.amount, 0);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = items.filter((i) => i.status === 'outstanding' && i.due >= today).slice(0, 8);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <p className="label text-[11px]">Admin · Staff</p>
        <h1 className="text-5xl">Pay<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-body">Tracking only — exports to QuickBooks/payroll; never moves money. Feeds Module 4 program margin.</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5"><p className="label text-[11px]">Outstanding</p><p className="text-3xl font-bold" style={{ color: '#b4483c' }}>{formatCAD(outstanding)}</p></div>
        <div className="card p-5"><p className="label text-[11px]">Paid</p><p className="text-3xl font-bold" style={{ color: '#3f7a5b' }}>{formatCAD(paid)}</p></div>
      </section>

      {upcoming.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-2xl">Upcoming pay dates</h2>
          <div className="flex flex-wrap gap-2">
            {upcoming.map((i) => <span key={i.id} className="tag">{fmt(i.due)} · {i.staff} · {formatCAD(i.amount)}</span>)}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-2xl">All pay dates</h2>
        <table className="data-table">
          <thead><tr><th>Due</th><th>Staff</th><th>Program</th><th>Amount</th><th>Status</th><th /></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td className="mono">{fmt(i.due)}</td>
                <td className="text-ink">{i.staff}</td>
                <td>{i.program}</td>
                <td className="mono">{formatCAD(i.amount)}</td>
                <td><span className="tag" style={i.status === 'paid' ? { color: '#3f7a5b', borderColor: '#3f7a5b' } : undefined}>{i.status}</span></td>
                <td>{i.status === 'outstanding' && (
                  <form action={markPayPaidAction}><input type="hidden" name="payDateId" value={i.id} /><button type="submit" className="btn-ghost btn-sm">Mark paid</button></form>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
