import Link from 'next/link';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createStaffAction } from './actions';

export const dynamic = 'force-dynamic';

const STATUS_COLOR: Record<string, string> = { active: '#3f7a5b', inactive: '#9ea1a1', archived: '#1e1e1e' };

/** Staff list + create (Module 5 Stage 1). Account-less coaches allowed. */
export default async function StaffListPage() {
  const { data: staff } = await supabaseAdmin().from('staff').select('id, first_name, last_name, email, status, profile_id').order('last_name');

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-hairline pb-6">
        <div>
          <p className="label text-[11px]">Admin · Staff</p>
          <h1 className="text-5xl">Staff<span style={{ color: 'var(--accent)' }}>.</span></h1>
        </div>
        <div className="flex gap-2">
          <Link href="/staff/permissions" className="btn-ghost btn-sm">Permission matrix</Link>
          <Link href="/staff/pay" className="btn-ghost btn-sm">Pay dashboard</Link>
        </div>
      </header>

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

      <table className="data-table">
        <thead><tr><th>Name</th><th>Email</th><th>Account</th><th>Status</th><th /></tr></thead>
        <tbody>
          {(staff ?? []).map((s) => (
            <tr key={s.id}>
              <td className="text-ink">{s.first_name} {s.last_name}</td>
              <td>{s.email ?? '—'}</td>
              <td>{s.profile_id ? <span className="tag">login</span> : <span className="tag">account-less</span>}</td>
              <td><span className="tag" style={{ color: STATUS_COLOR[s.status], borderColor: STATUS_COLOR[s.status] }}>{s.status}</span></td>
              <td><Link href={`/staff/${s.id}`} className="btn-ghost btn-sm">Open</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
