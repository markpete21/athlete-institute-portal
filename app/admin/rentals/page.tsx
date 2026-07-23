import Link from 'next/link';
import { formatCAD } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createRentalAction } from './actions';

export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, string> = {
  quote: '#9ea1a1',
  deposit_due: '#9e8959',
  balance_due: '#5b7a9e',
  overdue: '#b4483c',
  paid: '#3f7a5b',
  cancelled: '#1e1e1e',
};

/** Rentals list + creation (Module 3). Status colors per the state machine. */
export default async function RentalsListPage() {
  const db = supabaseAdmin();
  const [{ data: rentals }, { data: units }] = await Promise.all([
    db.from('rentals').select('id, title, status, is_internal, contact_name, total_cents, created_at').order('id', { ascending: false }).limit(50),
    db.from('business_units').select('id, name').eq('active', true).order('name'),
  ]);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <p className="label text-[11px]">Admin · Rentals</p>
        <h1 className="text-5xl">
          Rentals<span style={{ color: 'var(--accent)' }}>.</span>
        </h1>
      </header>

      <section className="card flex flex-col gap-4 p-6">
        <h2 className="text-2xl">New rental / quote</h2>
        <form action={createRentalAction} className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="title">Title</label>
            <input id="title" name="title" required placeholder="Spring Tournament - XYZ Basketball" className="input" />
          </div>
          <div>
            <label className="field-label" htmlFor="bookingType">Type</label>
            <select id="bookingType" name="bookingType" className="input" defaultValue="">
              <option value="">—</option>
              <option value="camp">Camp</option>
              <option value="event">Event</option>
              <option value="tournament">Tournament</option>
              <option value="league">League</option>
              <option value="clinic">Clinic</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="contactName">Contact name</label>
            <input id="contactName" name="contactName" className="input" />
          </div>
          <div>
            <label className="field-label" htmlFor="contactEmail">Contact email</label>
            <input id="contactEmail" name="contactEmail" type="email" className="input" />
          </div>
          <div>
            <label className="field-label" htmlFor="depositPct">Deposit %</label>
            <input id="depositPct" name="depositPct" type="number" defaultValue={25} min={0} max={100} className="input" />
          </div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-1 pb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-silver">
              <input type="checkbox" name="isInternal" /> internal ($0)
            </label>
            <select name="businessUnitId" className="input" defaultValue="">
              <option value="">business unit…</option>
              {(units ?? []).map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn-gold">Create</button>
          </div>
        </form>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-2xl">Recent</h2>
        <table className="data-table">
          <thead>
            <tr><th>Rental</th><th>Status</th><th>Contact</th><th>Total</th><th /></tr>
          </thead>
          <tbody>
            {(rentals ?? []).map((r) => (
              <tr key={r.id} className="clickable">
                <td className="text-ink">{r.title}{r.is_internal && <span className="tag ml-2">internal</span>}</td>
                <td>
                  <span className="tag" style={{ color: STATUS_STYLE[r.status], borderColor: STATUS_STYLE[r.status] }}>
                    {r.status.replace('_', ' ')}
                  </span>
                </td>
                <td>{r.contact_name ?? '—'}</td>
                <td className="mono">{formatCAD(r.total_cents)}</td>
                <td><Link href={`/rentals/${r.id}`} className="btn-ghost btn-sm">Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
