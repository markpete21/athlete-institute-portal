import Link from 'next/link';
import { buildTree, flattenTree, type FacilityNode } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { listBookings, type BookingRecord } from '@/lib/bookings';
import { findConflictPairs } from '@/lib/conflicts';
import { DayGantt } from '@/components/schedule/DayGantt';
import {
  bookingsByDate,
  filterBookings,
  ganttForDay,
  torontoDateOf,
  type ScheduleFilters,
} from '@/lib/schedule-views';
import { deleteViewAction, saveViewAction } from './actions';

export const dynamic = 'force-dynamic';

type ViewMode = 'day' | 'week' | 'month';

interface SavedView {
  id: number;
  name: string;
  facility_ids: number[];
  filters: { source?: string | null; status?: string | null; internal?: string | null };
}

const addDaysISO = (dateISO: string, n: number) => {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-CA', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' });

/**
 * The master schedule (Module 2 Stage 5): Day (default, parent/child Gantt),
 * Week, Month; saved custom views; location/facility-first filters; conflict
 * clash indicators linking to the queue.
 */
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { view?: string; date?: string; facilities?: string; source?: string; status?: string; internal?: string };
}) {
  const view = (['day', 'week', 'month'].includes(searchParams.view ?? '') ? searchParams.view : 'day') as ViewMode;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? '') ? searchParams.date! : torontoDateOf(new Date().toISOString());

  const db = supabaseAdmin();
  const [{ data: facRows }, { data: viewRows }] = await Promise.all([
    db.from('facilities').select('id, parent_id, name, label, sort_order, bookable, deleted_at').is('deleted_at', null),
    db.from('saved_schedule_views').select('id, name, facility_ids, filters').order('name'),
  ]);
  const tree = (facRows ?? []) as FacilityNode[];
  const savedViews = (viewRows ?? []) as SavedView[];
  const ordered = flattenTree(buildTree(tree));

  const selectedFacilities = (searchParams.facilities ?? '')
    .split(',').map(Number).filter(Boolean);
  const filters: ScheduleFilters = {
    facilityIds: selectedFacilities.length ? selectedFacilities : undefined,
    source: (searchParams.source as BookingRecord['source']) || undefined,
    status: (searchParams.status as BookingRecord['status']) || undefined,
    internal: (searchParams.internal as 'internal' | 'external') || undefined,
  };

  // Window per view mode.
  const windowFrom = view === 'month' ? `${date.slice(0, 7)}-01` : view === 'week' ? addDaysISO(date, -3) : date;
  const windowTo = view === 'month' ? addDaysISO(`${date.slice(0, 7)}-01`, 32) : view === 'week' ? addDaysISO(date, 4) : addDaysISO(date, 1);

  const [rawBookings, conflictPairs] = await Promise.all([
    listBookings({ from: `${windowFrom}T00:00:00-05:00`, to: `${windowTo}T23:59:59-04:00` }),
    findConflictPairs(`${windowFrom}T00:00:00Z`, `${windowTo}T23:59:59Z`),
  ]);
  const bookings = filterBookings(tree, rawBookings, filters);
  const conflictedIds = new Set(conflictPairs.flatMap((p) => [p.a.id, p.b.id]));

  // Gantt parents: the operational facilities (children of locations = depth 2).
  // With a facility filter active, keep only parents whose subtree touches the
  // selection (selection itself, its ancestors, or its descendants).
  const depth2 = ordered.filter((n) => n.depth === 2);
  const { ancestorIds } = await import('@ai/foundation');
  const parentIds = selectedFacilities.length
    ? depth2
        .filter((p) =>
          selectedFacilities.some(
            (id) =>
              id === p.id ||
              ancestorIds(tree, id).includes(p.id) || // selection sits inside p's subtree
              ancestorIds(tree, p.id).includes(id),   // p sits inside the selection's subtree
          ),
        )
        .map((p) => p.id)
    : depth2.map((n) => n.id);

  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    p.set('view', over.view ?? view);
    p.set('date', over.date ?? date);
    if (searchParams.facilities) p.set('facilities', searchParams.facilities);
    if (searchParams.source) p.set('source', searchParams.source);
    if (searchParams.status) p.set('status', searchParams.status);
    if (searchParams.internal) p.set('internal', searchParams.internal);
    for (const [k, v] of Object.entries(over)) p.set(k, v);
    return `/schedule?${p.toString()}`;
  };

  const step = view === 'day' ? 1 : view === 'week' ? 7 : 31;

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-5">
        <div>
          <p className="label text-[11px]">Admin · Master schedule</p>
          <h1 className="text-4xl">
            Schedule<span style={{ color: 'var(--accent)' }}>.</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href={qs({ date: addDaysISO(date, -step) })} className="btn-ghost btn-sm">←</Link>
          <span className="mono text-sm text-ink">{date}</span>
          <Link href={qs({ date: addDaysISO(date, step) })} className="btn-ghost btn-sm">→</Link>
          <span className="w-2" />
          {(['day', 'week', 'month'] as const).map((v) => (
            <Link key={v} href={qs({ view: v })} className={v === view ? 'btn-gold btn-sm' : 'btn-ghost btn-sm'}>
              {v}
            </Link>
          ))}
          <Link href="/conflicts" className="btn-ghost btn-sm">
            Conflicts{conflictedIds.size ? ` (${conflictPairs.length})` : ''}
          </Link>
        </div>
      </header>

      {/* Filters - location/facility first (spec ordering) */}
      <form method="get" action="/schedule" className="card flex flex-wrap items-end gap-3 p-4">
        <input type="hidden" name="view" value={view} />
        <input type="hidden" name="date" value={date} />
        <div className="min-w-56 flex-1">
          <label className="field-label" htmlFor="facilities">Location / facility</label>
          <select id="facilities" name="facilities" className="input" defaultValue={searchParams.facilities ?? ''}>
            <option value="">All facilities</option>
            {ordered.map((f) => (
              <option key={f.id} value={f.id}>{' '.repeat(f.depth * 2)}{f.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="source">Source</label>
          <select id="source" name="source" className="input" defaultValue={searchParams.source ?? ''}>
            <option value="">All</option>
            <option value="rental">Rental</option>
            <option value="program">Program</option>
            <option value="event">Event</option>
            <option value="internal">Internal</option>
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="internal">Int/Ext</label>
          <select id="internal" name="internal" className="input" defaultValue={searchParams.internal ?? ''}>
            <option value="">All</option>
            <option value="internal">Internal</option>
            <option value="external">External</option>
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input" defaultValue={searchParams.status ?? ''}>
            <option value="">All</option>
            <option value="tentative">Tentative</option>
            <option value="confirmed">Confirmed</option>
          </select>
        </div>
        <button type="submit" className="btn-gold btn-sm">Apply</button>
      </form>

      {/* Saved views */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="label text-[11px]">Saved views:</span>
        {savedViews.map((v) => {
          const p = new URLSearchParams({ view, date });
          if (v.facility_ids.length) p.set('facilities', v.facility_ids.join(','));
          if (v.filters.source) p.set('source', v.filters.source);
          if (v.filters.status) p.set('status', v.filters.status);
          if (v.filters.internal) p.set('internal', v.filters.internal);
          return (
            <span key={v.id} className="flex items-center gap-1">
              <Link href={`/schedule?${p.toString()}`} className="tag hover:border-ink hover:text-ink">{v.name}</Link>
              <form action={deleteViewAction}>
                <input type="hidden" name="viewId" value={v.id} />
                <button type="submit" className="text-[11px] text-silver hover:text-neg" title="Delete view">×</button>
              </form>
            </span>
          );
        })}
        <form action={saveViewAction} className="flex items-center gap-2">
          <input type="hidden" name="facilities" value={searchParams.facilities ?? ''} />
          <input type="hidden" name="source" value={searchParams.source ?? ''} />
          <input type="hidden" name="status" value={searchParams.status ?? ''} />
          <input type="hidden" name="internal" value={searchParams.internal ?? ''} />
          <input name="name" placeholder="Save current as…" className="input max-w-44 text-sm" />
          <button type="submit" className="btn-ghost btn-sm">Save view</button>
        </form>
      </div>

      {view === 'day' && (
        <DayGantt rows={ganttForDay(tree, bookings, date, parentIds, conflictedIds)} />
      )}

      {view === 'week' && (
        <div className="grid gap-3 md:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => addDaysISO(addDaysISO(date, -3), i)).map((d) => {
            const day = (bookingsByDate(bookings).get(d) ?? []).sort((x, y) => x.starts_at.localeCompare(y.starts_at));
            return (
              <div key={d} className={`card p-3 ${d === date ? 'border-2' : ''}`} style={d === date ? { borderColor: 'var(--accent)' } : undefined}>
                <Link href={qs({ view: 'day', date: d })} className="label block pb-2 text-[10px] hover:text-ink">{d}</Link>
                <div className="flex flex-col gap-1">
                  {day.map((b) => (
                    <div key={b.id} className="text-[11px]" title={b.title}>
                      <span className="mono text-silver">{fmtTime(b.starts_at)}</span>{' '}
                      <span className={conflictedIds.has(b.id) ? 'font-bold text-neg' : 'text-ink'}>
                        {conflictedIds.has(b.id) ? '⚠ ' : ''}{b.title}
                      </span>
                    </div>
                  ))}
                  {day.length === 0 && <span className="text-[11px] text-silver">—</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === 'month' && (
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 35 }, (_, i) => addDaysISO(`${date.slice(0, 7)}-01`, i - 3)).map((d) => {
            const day = bookingsByDate(bookings).get(d) ?? [];
            const inMonth = d.slice(0, 7) === date.slice(0, 7);
            return (
              <Link key={d} href={qs({ view: 'day', date: d })} className={`card min-h-20 p-2 ${inMonth ? '' : 'opacity-40'}`}>
                <span className="mono text-[10px] text-silver">{d.slice(8)}</span>
                {day.slice(0, 3).map((b) => (
                  <p key={b.id} className={`truncate text-[10px] ${conflictedIds.has(b.id) ? 'font-bold text-neg' : 'text-ink'}`}>{b.title}</p>
                ))}
                {day.length > 3 && <p className="text-[10px] text-silver">+{day.length - 3} more</p>}
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
