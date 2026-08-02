import Link from 'next/link';
import { formatCAD } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { listOrganizations } from '@/lib/booking-config';
import { getDefaultCreditCapCents } from '@/lib/credits';
import { setDefaultCreditCapAction } from './[id]/actions';
import { setAccountTypeAction } from './actions';
import { ACCOUNT_TYPES } from './types';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

/**
 * Accounts: every profile with its high-level account type - Member,
 * Organization, Staff (staff can still sign up for programs), plus Module 1's
 * tenant. Paginated with a real count (post-import this is ~7,000 rows);
 * each name opens the account detail page.
 */
export default async function AccountsPage({
  searchParams,
}: {
  searchParams: { q?: string; type?: string; status?: string; page?: string };
}) {
  const q = (searchParams.q ?? '').trim();
  const typeFilter = ACCOUNT_TYPES.some((t) => t.value === searchParams.type) ? searchParams.type! : '';
  const statusFilter = ['active', 'suspended', 'archived', 'unclaimed'].includes(searchParams.status ?? '') ? searchParams.status! : '';
  const page = Math.max(1, Number(searchParams.page) || 1);

  const db = supabaseAdmin();
  let query = db
    .from('profiles')
    .select('id, first_name, last_name, email, user_type, status, claim_token, claimed_at', { count: 'exact' })
    .order('last_name', { nullsFirst: false })
    .order('id')
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`);
  if (typeFilter) query = query.eq('user_type', typeFilter);
  if (statusFilter === 'unclaimed') query = query.not('claim_token', 'is', null).is('claimed_at', null);
  else if (statusFilter) query = query.eq('status', statusFilter);

  const [{ data: profiles, count }, organizations, defaultCap] = await Promise.all([
    query,
    listOrganizations(),
    getDefaultCreditCapCents(),
  ]);
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    if (typeFilter) sp.set('type', typeFilter);
    if (statusFilter) sp.set('status', statusFilter);
    if (p > 1) sp.set('page', String(p));
    const s = sp.toString();
    return `/accounts${s ? `?${s}` : ''}`;
  };

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
          Click a name for the full household view.
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
        <div>
          <label className="field-label" htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={statusFilter} className="input h-9 text-sm">
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="archived">Archived</option>
            <option value="unclaimed">Unclaimed imports</option>
          </select>
        </div>
        <button type="submit" className="btn-gold btn-sm">Filter</button>
      </form>

      <div className="flex items-center justify-between">
        <p className="label text-[11px]">Showing {from}–{to} of {total.toLocaleString('en-CA')}</p>
        {pages > 1 && (
          <p className="flex items-center gap-3 text-sm">
            {page > 1 && <Link href={pageHref(page - 1)} className="underline hover:text-ink">← Prev</Link>}
            <span className="mono text-xs">{page} / {pages}</span>
            {page < pages && <Link href={pageHref(page + 1)} className="underline hover:text-ink">Next →</Link>}
          </p>
        )}
      </div>

      <table className="data-table">
        <thead>
          <tr><th>Name</th><th>Email</th><th>Status</th><th>Account type</th></tr>
        </thead>
        <tbody>
          {(profiles ?? []).map((p) => (
            <tr key={p.id}>
              <td>
                <Link href={`/accounts/${p.id}`} className="text-ink underline-offset-2 hover:underline">
                  {[p.first_name, p.last_name].filter(Boolean).join(' ') || '—'}
                </Link>
              </td>
              <td className="mono text-xs">{p.email ?? '—'}</td>
              <td>
                <span className="tag">{p.status}</span>
                {p.claim_token && !p.claimed_at && <span className="tag" title="Imported, not yet claimed"> unclaimed</span>}
              </td>
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

      <section className="card flex flex-col gap-3 p-5" style={{ maxWidth: 420 }}>
        <h2 className="text-lg">Staff credit default</h2>
        <p className="text-xs text-silver">
          Every staff account tops up TO this cap at the start of each season
          (Jan–Apr / May–Aug / Sep–Dec) unless it has a per-account override.
        </p>
        <form action={setDefaultCreditCapAction} className="flex items-end gap-2">
          <div className="flex-1">
            <label className="field-label" htmlFor="capDollars">Cap ($ per season)</label>
            <input id="capDollars" name="capDollars" type="number" step="0.01" min="0"
              defaultValue={(defaultCap / 100).toFixed(2)} className="input h-9 text-sm" />
          </div>
          <button type="submit" className="btn-ghost btn-sm">Save</button>
        </form>
        <p className="mono text-xs text-silver">Currently {formatCAD(defaultCap)}</p>
      </section>
    </main>
  );
}
