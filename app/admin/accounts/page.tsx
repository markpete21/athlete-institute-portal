import { supabaseAdmin } from '@ai/foundation/supabase';
import { listOrganizations } from '@/lib/booking-config';
import { ACCOUNT_TYPES, setAccountTypeAction } from './actions';

export const dynamic = 'force-dynamic';

const TYPE_LABEL = new Map(ACCOUNT_TYPES.map((t) => [t.value, t.label]));

/**
 * Accounts: every profile with its high-level account type - Member,
 * Organization, Staff (staff can still sign up for programs), plus Module 1's
 * tenant. Type is changeable per account right here; organizations as
 * entities (with their invoicing representative) list below.
 */
export default async function AccountsPage({
  searchParams,
}: {
  searchParams: { q?: string; type?: string };
}) {
  const q = (searchParams.q ?? '').trim();
  const typeFilter = ACCOUNT_TYPES.some((t) => t.value === searchParams.type) ? searchParams.type! : '';

  const db = supabaseAdmin();
  let query = db
    .from('profiles')
    .select('id, first_name, last_name, email, user_type, status')
    .order('last_name', { nullsFirst: false })
    .limit(200);
  if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`);
  if (typeFilter) query = query.eq('user_type', typeFilter);

  const [{ data: profiles }, organizations] = await Promise.all([query, listOrganizations()]);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2 border-b border-hairline pb-5">
        <p className="label text-[11px]">Admin · People &amp; staff</p>
        <h1 className="text-4xl">
          Accounts<span style={{ color: 'var(--accent)' }}>.</span>
        </h1>
        <p className="text-body">
          Three high-level account types — Member, Organization, Staff (staff
          accounts can still register for programs) — changeable per account.
        </p>
      </header>

      <form method="get" action="/accounts" className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-56 flex-1">
          <label className="field-label" htmlFor="q">Search</label>
          <input id="q" name="q" defaultValue={q} placeholder="Name or email…" className="input h-9 text-sm" />
        </div>
        <div>
          <label className="field-label" htmlFor="type">Type</label>
          <select id="type" name="type" defaultValue={typeFilter} className="input h-9 text-sm">
            <option value="">All</option>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-gold btn-sm">Filter</button>
      </form>

      <table className="data-table">
        <thead>
          <tr><th>Name</th><th>Email</th><th>Status</th><th>Account type</th></tr>
        </thead>
        <tbody>
          {(profiles ?? []).map((p) => (
            <tr key={p.id}>
              <td className="text-ink">{[p.first_name, p.last_name].filter(Boolean).join(' ') || '—'}</td>
              <td className="mono text-xs">{p.email ?? '—'}</td>
              <td><span className="tag">{p.status}</span></td>
              <td>
                <form action={setAccountTypeAction} className="flex items-center gap-2">
                  <input type="hidden" name="profileId" value={p.id} />
                  <select name="userType" defaultValue={p.user_type} className="input h-8 max-w-36 text-sm">
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <button type="submit" className="btn-ghost btn-sm">Save</button>
                </form>
              </td>
            </tr>
          ))}
          {(profiles ?? []).length === 0 && (
            <tr><td colSpan={4} className="text-silver">No accounts match.</td></tr>
          )}
        </tbody>
      </table>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-2xl">Organizations</h2>
          <p className="text-sm text-silver">
            Organizations as booking customers, each with a representative used
            for quotes and invoicing — the rep needs no account (one can be
            linked later). Quick-add lives in the booking wizard too.
          </p>
        </div>
        <table className="data-table">
          <thead>
            <tr><th>Organization</th><th>Representative</th><th>Rep email</th></tr>
          </thead>
          <tbody>
            {organizations.map((o) => (
              <tr key={o.id}>
                <td className="text-ink">{o.name}</td>
                <td>{o.rep_name ?? '—'}</td>
                <td className="mono text-xs">{o.rep_email ?? '—'}</td>
              </tr>
            ))}
            {organizations.length === 0 && (
              <tr><td colSpan={3} className="text-silver">None yet — add one from the booking wizard.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
