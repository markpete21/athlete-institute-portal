import Link from 'next/link';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { listOfficials } from '@/lib/competitive/officials';
import { toggleOfficialAction, upsertOfficialAction } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * Officials pool: the shared referee list every division books from.
 * Availability is a simple daily window + per-day cap; linking a staff row
 * powers the coach-conflict rule (an official never works a game whose team
 * they coach).
 */
export default async function OfficialsPage() {
  const db = supabaseAdmin();
  const [officials, { data: staff }] = await Promise.all([
    listOfficials(true),
    db.from('staff').select('id, first_name, last_name').eq('status', 'active').order('last_name'),
  ]);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-14">
      <header className="flex flex-col gap-2 border-b border-hairline pb-5">
        <p className="label text-[11px]">Admin · Competitive · Officials</p>
        <h1 className="text-4xl">Officials pool<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-body max-w-[62ch] text-sm">
          Every division books from this pool. Set each official&apos;s daily window and cap once -
          the booker respects them automatically, spreads games (and pay) evenly, and never assigns
          anyone to a game involving a team they coach.
        </p>
      </header>

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-2xl">Add an official</h2>
        <form action={upsertOfficialAction} className="grid gap-3 sm:grid-cols-4">
          <div><label className="field-label">First name</label><input name="firstName" required className="input text-sm" /></div>
          <div><label className="field-label">Last name</label><input name="lastName" required className="input text-sm" /></div>
          <div><label className="field-label">Email</label><input name="email" type="email" className="input text-sm" /></div>
          <div><label className="field-label">Phone</label><input name="phone" className="input text-sm" /></div>
          <div><label className="field-label">Available from</label><input name="availStart" type="time" className="input text-sm" /></div>
          <div><label className="field-label">Until</label><input name="availEnd" type="time" className="input text-sm" /></div>
          <div><label className="field-label">Max games/day</label><input name="maxPerDay" type="number" defaultValue={4} min={1} max={12} className="input text-sm" /></div>
          <div><label className="field-label">Pay per game ($)</label><input name="payDollars" type="number" defaultValue={35} min={0} step="0.5" className="input text-sm" /></div>
          <div className="sm:col-span-2">
            <label className="field-label">Also coaches (staff link, powers the conflict rule)</label>
            <select name="staffId" className="input text-sm">
              <option value="">Not a coach</option>
              {(staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2"><label className="field-label">Notes</label><input name="notes" className="input text-sm" /></div>
          <div className="flex items-end"><button type="submit" className="btn-gold btn-sm">Add official</button></div>
        </form>
        <p className="label text-[9px]">Leave the window blank for &ldquo;any time&rdquo;. An official with no email still books - you just can&apos;t auto-send their schedule.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-2xl">Pool ({officials.filter((o) => o.active).length} active)</h2>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Official</th><th>Window</th><th>Cap</th><th>Pay</th><th>Coaches</th><th>Contact</th><th>Active</th></tr></thead>
            <tbody>
              {officials.map((o) => (
                <tr key={o.id}>
                  <td className="text-ink">{o.firstName} {o.lastName}</td>
                  <td className="mono">{o.availStart && o.availEnd ? `${o.availStart}-${o.availEnd}` : 'any time'}</td>
                  <td className="mono">{o.maxPerDay}/day</td>
                  <td className="mono">${(o.payCents / 100).toFixed(2)}</td>
                  <td>{o.staffId ? <span className="tag">coach link</span> : <span className="text-silver">-</span>}</td>
                  <td className="text-silver">{o.email ?? o.phone ?? '-'}</td>
                  <td>
                    <form action={toggleOfficialAction} className="flex items-center gap-1">
                      <input type="hidden" name="officialId" value={o.id} />
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" name="active" defaultChecked={o.active} /> active
                      </label>
                      <button type="submit" className="btn-ghost btn-sm">Save</button>
                    </form>
                  </td>
                </tr>
              ))}
              {officials.length === 0 && <tr><td colSpan={7} className="text-silver">No officials yet - add the first one above.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <Link href="/competitive" className="label text-[11px] hover:text-ink">← All divisions</Link>
    </main>
  );
}
