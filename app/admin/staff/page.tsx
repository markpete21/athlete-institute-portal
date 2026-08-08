import Link from 'next/link';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { upcomingUnavailability } from '@/lib/staff/staff';
import { createStaffAction } from './actions';

export const dynamic = 'force-dynamic';

const STATUS_COLOR: Record<string, string> = { active: '#3f7a5b', inactive: '#9ea1a1', archived: '#1e1e1e' };
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });

/** Staff list + create (Module 5 Stage 1). Account-less coaches allowed. */
export default async function StaffListPage({ searchParams }: { searchParams: { q?: string; status?: string } }) {
  const q = (searchParams.q ?? '').trim();
  const statusFilter = ['active', 'inactive', 'archived'].includes(searchParams.status ?? '') ? searchParams.status! : '';

  const db = supabaseAdmin();
  let query = db.from('staff').select('id, first_name, last_name, email, status, profile_id, photo_url').order('last_name');
  if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`);
  if (statusFilter) query = query.eq('status', statusFilter);
  const [{ data: staff }, unavailability] = await Promise.all([query, upcomingUnavailability()]);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-hairline pb-6">
        <div>
          <p className="label text-[11px]">Admin · People &amp; staff</p>
          <h1 className="text-5xl">Staff<span style={{ color: 'var(--accent)' }}>.</span></h1>
          <p className="text-body mt-2">Records, roles, per-program pay, certifications. Status derives itself: assigned to a current program or owed pay = active.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/staff/permissions" className="btn-ghost btn-sm">Permission matrix</Link>
          <Link href="/staff/pay" className="btn-ghost btn-sm">Pay dashboard</Link>
        </div>
      </header>

      {unavailability.length > 0 && (
        <section className="card flex flex-col gap-2 p-4">
          <p className="label text-[11px]">Upcoming submitted unavailability</p>
          <div className="flex flex-wrap gap-2">
            {unavailability.slice(0, 12).map((u) => (
              <Link key={`${u.staff_id}:${u.date}`} href={`/staff/${u.staff_id}`} className="tag hover:border-ink">
                {u.name} · {fmt(u.date)}{u.note ? ` · ${u.note}` : ''}
              </Link>
            ))}
            {unavailability.length > 12 && <span className="text-sm text-silver">+{unavailability.length - 12} more</span>}
          </div>
        </section>
      )}

      <section className="card flex flex-col gap-3 p-6">
        <h2 className="text-2xl">Add staff / coach</h2>
        <form action={createStaffAction} className="grid gap-3 sm:grid-cols-4">
          <div><label className="field-label" htmlFor="firstName">First</label><input id="firstName" name="firstName" required className="input" /></div>
          <div><label className="field-label" htmlFor="lastName">Last</label><input id="lastName" name="lastName" required className="input" /></div>
          <div><label className="field-label" htmlFor="email">Email (optional)</label><input id="email" name="email" type="email" placeholder="add later to invite" className="input" /></div>
          <div className="flex items-end"><button type="submit" className="btn-gold">Add</button></div>
          <div className="sm:col-span-4"><label className="field-label" htmlFor="bio">Bio (global)</label><textarea id="bio" name="bio" rows={2} className="input" /></div>
        </form>
        <p className="text-sm text-silver">A coach can be added with no account or email now (e.g. from a roster upload) and upgraded to a login later.</p>
      </section>

      <form method="get" action="/staff" className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label className="field-label" htmlFor="q">Search</label>
          <input id="q" name="q" defaultValue={q} placeholder="Name or email…" className="input h-9 text-sm" />
        </div>
        <div>
          <label className="field-label" htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={statusFilter} className="input h-9 text-sm">
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <button type="submit" className="btn-ghost btn-sm">Filter</button>
      </form>

      <table className="data-table">
        <thead><tr><th /><th>Name</th><th>Email</th><th>Account</th><th>Status</th><th /></tr></thead>
        <tbody>
          {(staff ?? []).map((s) => (
            <tr key={s.id}>
              <td className="w-10">
                <span className="block h-8 w-8 overflow-hidden rounded-full border border-hairline bg-paper-panel">
                  {s.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.photo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-silver">{s.first_name[0]}{s.last_name[0]}</span>
                  )}
                </span>
              </td>
              <td className="text-ink">{s.first_name} {s.last_name}</td>
              <td>{s.email ?? '—'}</td>
              <td>{s.profile_id ? <span className="tag">login</span> : <span className="tag">account-less</span>}</td>
              <td><span className="tag" style={{ color: STATUS_COLOR[s.status], borderColor: STATUS_COLOR[s.status] }}>{s.status}</span></td>
              <td><Link href={`/staff/${s.id}`} className="btn-ghost btn-sm">Open</Link></td>
            </tr>
          ))}
          {(staff ?? []).length === 0 && <tr><td colSpan={6} className="text-silver">No staff match.</td></tr>}
        </tbody>
      </table>
    </main>
  );
}
