import Link from 'next/link';
import { formatCAD, RENTAL_STATUS_COLOR, type RentalStatus } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { searchRentals, type RentalSearchFilters } from '@/lib/rentals/search';
import { createRentalAction } from './actions';

export const dynamic = 'force-dynamic';

const TZ = 'America/Toronto';
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' });

const STATUSES: Array<{ value: string; label: string }> = [
  { value: 'quote', label: 'Quote' },
  { value: 'deposit_due', label: 'Deposit due' },
  { value: 'balance_due', label: 'Balance due' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
  { value: 'cancelled', label: 'Cancelled' },
];

const TYPES = ['camp', 'event', 'tournament', 'league', 'clinic', 'other'];

/**
 * Rentals finder (Module 3 review). This screen used to be the newest 50 rows
 * with no search, which made anything older than the last couple of months
 * unreachable. Search runs server-side across the whole table.
 *
 * A quote and a rental are the same record at different points in its status
 * walk, so one finder covers both; the status chips are the difference.
 */
export default async function RentalsListPage({
  searchParams,
}: {
  searchParams: {
    q?: string; status?: string; kind?: string; type?: string;
    from?: string; to?: string; owing?: string; new?: string;
  };
}) {
  const filters: RentalSearchFilters = {
    q: searchParams.q?.trim() || undefined,
    status: (searchParams.status as RentalSearchFilters['status']) || '',
    kind: searchParams.kind || '',
    bookingType: searchParams.type || '',
    createdFrom: searchParams.from || undefined,
    createdTo: searchParams.to || undefined,
    outstandingOnly: searchParams.owing === '1',
  };
  const active =
    !!filters.q || !!filters.status || !!filters.kind || !!filters.bookingType
    || !!filters.createdFrom || !!filters.createdTo || !!filters.outstandingOnly;

  const [rows, { data: units }] = await Promise.all([
    searchRentals(filters),
    supabaseAdmin().from('business_units').select('id, name').eq('active', true).order('name'),
  ]);

  const totalValue = rows.reduce((s, r) => s + r.total_cents, 0);
  const totalOwing = rows.reduce((s, r) => s + r.outstanding_cents, 0);
  const showCreate = searchParams.new === '1';

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-5">
        <div>
          <p className="label text-[11px]">Admin · Rentals</p>
          <h1 className="text-4xl">
            Rentals<span style={{ color: 'var(--accent)' }}>.</span>
          </h1>
          <p className="mt-1 text-sm text-silver">
            Quotes, agreements and their invoices. Search by title, contact,
            organization, phone, note text or <span className="mono">#id</span>.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/rentals/invoices" className="btn-ghost btn-sm">Invoices</Link>
          <Link href="/rentals/settings" className="btn-ghost btn-sm">Rates &amp; settings</Link>
          <Link href="/schedule/book?intent=quote&nofacility=1" className="btn-gold btn-sm">New quote</Link>
        </div>
      </header>

      <form method="get" action="/rentals" className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-64 flex-1">
          <label className="field-label" htmlFor="q">Search</label>
          <input
            id="q" name="q" defaultValue={searchParams.q ?? ''}
            placeholder="Headwaters, jane@…, #412, tournament…" className="input"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={searchParams.status ?? ''} className="input">
            <option value="">Any</option>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="kind">Int/Ext</label>
          <select id="kind" name="kind" defaultValue={searchParams.kind ?? ''} className="input">
            <option value="">All</option>
            <option value="external">External</option>
            <option value="internal">Internal</option>
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="type">Type</label>
          <select id="type" name="type" defaultValue={searchParams.type ?? ''} className="input">
            <option value="">Any</option>
            {TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="from">Created from</label>
          <input id="from" type="date" name="from" defaultValue={searchParams.from ?? ''} className="input" />
        </div>
        <div>
          <label className="field-label" htmlFor="to">To</label>
          <input id="to" type="date" name="to" defaultValue={searchParams.to ?? ''} className="input" />
        </div>
        <label className="flex items-center gap-1 pb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-silver">
          <input type="checkbox" name="owing" value="1" defaultChecked={searchParams.owing === '1'} /> owing only
        </label>
        <button type="submit" className="btn-gold btn-sm">Search</button>
        {active && <Link href="/rentals" className="btn-ghost btn-sm">Clear</Link>}
      </form>

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-silver">
          {rows.length} result{rows.length === 1 ? '' : 's'}
          {rows.length >= 100 && ' (first 100 — narrow the search)'}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-silver">
          Value <b className="text-ink">{formatCAD(totalValue)}</b>
        </span>
        {totalOwing > 0 && (
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-silver">
            Outstanding <b style={{ color: 'var(--accent)' }}>{formatCAD(totalOwing)}</b>
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="card p-8 text-center text-body">
          {active ? 'Nothing matches those filters.' : 'No rentals yet.'}
        </p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Rental</th><th>Status</th><th>Contact</th><th>Dates</th>
              <th className="text-right">Total</th><th className="text-right">Owing</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="clickable">
                <td className="text-ink">
                  <Link href={`/rentals/${r.id}`} className="hover:underline">{r.title}</Link>
                  <span className="mono ml-2 text-[10px] text-silver">#{r.id}</span>
                  {r.is_internal && <span className="tag ml-2">internal</span>}
                </td>
                <td>
                  <span
                    className="tag"
                    style={{
                      color: RENTAL_STATUS_COLOR[r.status as RentalStatus],
                      borderColor: RENTAL_STATUS_COLOR[r.status as RentalStatus],
                    }}
                  >
                    {r.status.replace('_', ' ')}
                  </span>
                </td>
                <td>
                  {r.organization_name ?? r.contact_name ?? '—'}
                  {r.organization_name && r.contact_name && (
                    <span className="block text-[11px] text-silver">{r.contact_name}</span>
                  )}
                </td>
                <td className="text-[11px]">
                  {r.first_block
                    ? r.first_block.slice(0, 10) === r.last_block?.slice(0, 10)
                      ? fmtDay(r.first_block)
                      : `${fmtDay(r.first_block)} – ${fmtDay(r.last_block!)}`
                    : <span className="text-silver">no dates</span>}
                </td>
                <td className="mono text-right">{formatCAD(r.total_cents)}</td>
                <td className="mono text-right">
                  {r.outstanding_cents > 0 ? (
                    <span style={r.past_due ? { color: '#b4483c', fontWeight: 700 } : undefined}>
                      {formatCAD(r.outstanding_cents)}
                      {r.past_due && <span className="block text-[10px]">past due</span>}
                    </span>
                  ) : (
                    <span className="text-silver">—</span>
                  )}
                </td>
                <td className="flex gap-1">
                  <Link href={`/rentals/${r.id}`} className="btn-ghost btn-sm">Open</Link>
                  <Link href={`/rentals/${r.id}/document?type=quote`} className="btn-ghost btn-sm">Doc</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Kept for the rare blank-slate rental. The wizard is the normal route
          in, which is why this is folded away rather than sitting on top of
          the finder. */}
      <details className="card p-6" open={showCreate}>
        <summary className="cursor-pointer text-2xl">Create a blank rental</summary>
        <p className="mb-4 mt-2 text-sm text-silver">
          Most rentals should start from the booking wizard so the facility time
          and conflicts are handled. Use this only when you need the record
          before you know the dates.
        </p>
        <form action={createRentalAction} className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="title">Title</label>
            <input id="title" name="title" required placeholder="Spring Tournament - XYZ Basketball" className="input" />
          </div>
          <div>
            <label className="field-label" htmlFor="bookingType">Type</label>
            <select id="bookingType" name="bookingType" className="input" defaultValue="">
              <option value="">—</option>
              {TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
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
      </details>
    </main>
  );
}
