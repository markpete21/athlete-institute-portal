import Link from 'next/link';
import { buildTree, flattenTree, torontoInstant, type FacilityNode } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { getPortalSession } from '@/lib/auth';
import { listBookings, type BookingRecord } from '@/lib/bookings';
import { findConflictPairs } from '@/lib/conflicts';
import { listLocations } from '@/lib/locations';
import { resolveLocationId, type FacilityRow } from '@/lib/facilities';
import { DateJump } from '@/components/schedule/DateJump';
import { DayGantt } from '@/components/schedule/DayGantt';
import {
  DAY_AXIS,
  bookingsByDate,
  filterBookings,
  ganttForDay,
  torontoDateOf,
  type ScheduleFilters,
} from '@/lib/schedule-views';
import { deleteViewAction, saveViewAction } from './actions';

/** Bar colours for the week/month mini-cards (mirrors the Gantt legend). */
const SOURCE_COLOR: Record<string, string> = {
  program: 'var(--accent)',
  event: '#3f7a5b',
  rental: '#5b7a9e',
  internal: '#9ea1a1',
};

export const dynamic = 'force-dynamic';

type ViewMode = 'day' | 'week' | 'month';

interface SavedView {
  id: number;
  name: string;
  facility_ids: number[];
  filters: { location?: string | null; source?: string | null; status?: string | null; internal?: string | null };
  shared: boolean;
  created_by: string;
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
  searchParams: { view?: string; date?: string; location?: string; facilities?: string; source?: string; status?: string; internal?: string; book?: string; intent?: string; hide?: string };
}) {
  const view = (['day', 'week', 'month'].includes(searchParams.view ?? '') ? searchParams.view : 'day') as ViewMode;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? '') ? searchParams.date! : torontoDateOf(new Date().toISOString());

  const session = await getPortalSession();
  const db = supabaseAdmin();
  const [{ data: facRows }, { data: viewRows }, locations] = await Promise.all([
    db.from('facilities').select('id, parent_id, name, label, sort_order, bookable, deleted_at, location_id').is('deleted_at', null),
    // Everyone sees shared views; personal views only surface for their owner.
    db.from('saved_schedule_views')
      .select('id, name, facility_ids, filters, shared, created_by')
      .or(`shared.eq.true,created_by.eq.${session.userId}`)
      .order('name'),
    listLocations(),
  ]);
  const tree = (facRows ?? []) as FacilityRow[];
  const savedViews = (viewRows ?? []) as SavedView[];
  const ordered = flattenTree(buildTree(tree));

  // Location filter (above facility, spec ordering): a location narrows the
  // facility dropdown and the board to the site's subtree. Site nodes carry
  // facilities.location_id; everything beneath inherits via walk-up.
  const selectedLocation = Number(searchParams.location) || null;
  const locationFacilityIds = selectedLocation
    ? ordered.filter((f) => resolveLocationId(tree, f.id) === selectedLocation).map((f) => f.id)
    : null;
  const facilityChoices = locationFacilityIds
    ? ordered.filter((f) => locationFacilityIds.includes(f.id))
    : ordered;

  const explicitFacilities = (searchParams.facilities ?? '')
    .split(',').map(Number).filter(Boolean);
  // Explicit facility beats location; otherwise the location's site roots act
  // as the (tree-aware) selection.
  const selectedFacilities = explicitFacilities.length
    ? explicitFacilities
    : selectedLocation
      ? tree.filter((f) => f.location_id === selectedLocation).map((f) => f.id)
      : [];
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

  // Gantt parents: the operational facilities (children of locations = depth 2)
  // PLUS childless locations (OCS has no spaces inside it yet - without this
  // its bookings would silently vanish from the primary view). With a facility
  // filter active, keep only parents whose subtree touches the selection
  // (selection itself, its ancestors, or its descendants).
  const depth2 = ordered.filter(
    (n) => n.depth === 2 || (n.depth === 1 && !tree.some((c) => c.parent_id === n.id)),
  );
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

  const bookMode = searchParams.book === '1';
  // Hide-unbooked collapses empty facility rows; booking mode needs every row
  // clickable, so the toggle is ignored while selecting.
  const hideUnbooked = searchParams.hide === '1' && !bookMode;
  const bookIntent = searchParams.intent === 'quote' ? 'quote' as const : 'book' as const;

  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    p.set('view', over.view ?? view);
    p.set('date', over.date ?? date);
    if (searchParams.location) p.set('location', searchParams.location);
    if (searchParams.facilities) p.set('facilities', searchParams.facilities);
    if (searchParams.source) p.set('source', searchParams.source);
    if (searchParams.status) p.set('status', searchParams.status);
    if (searchParams.internal) p.set('internal', searchParams.internal);
    if (searchParams.hide === '1') p.set('hide', '1');
    if (bookMode) p.set('book', '1');
    if (bookMode && searchParams.intent) p.set('intent', searchParams.intent);
    for (const [k, v] of Object.entries(over)) {
      if (v === '') p.delete(k);
      else p.set(k, v);
    }
    return `/schedule?${p.toString()}`;
  };

  const step = view === 'day' ? 1 : view === 'week' ? 7 : 31;

  // Now-marker fraction (red line) when viewing today.
  const axisStartMs = Date.parse(torontoInstant(date, `${String(DAY_AXIS.startHour).padStart(2, '0')}:00`));
  const axisEndMs = Date.parse(torontoInstant(date, `${String(DAY_AXIS.endHour).padStart(2, '0')}:00`));
  const rawNowFrac = (Date.now() - axisStartMs) / (axisEndMs - axisStartMs);
  const nowFrac =
    torontoDateOf(new Date().toISOString()) === date && rawNowFrac >= 0 && rawNowFrac <= 1
      ? rawNowFrac
      : null;

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
          <DateJump date={date} baseQuery={qs({}).split('?')[1] ?? ''} />
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
          {view === 'day' && !bookMode && (
            <Link
              href={qs({ hide: hideUnbooked ? '' : '1' })}
              className={hideUnbooked ? 'btn-gold btn-sm' : 'btn-ghost btn-sm'}
              title="Collapse facilities with no bookings on this day"
            >
              {hideUnbooked ? 'Show all' : 'Hide unbooked'}
            </Link>
          )}
          <Link href="/schedule/calendar" className="btn-ghost btn-sm" title="Subscribe your calendar to this schedule">Sync</Link>
          {bookMode ? (
            <Link href={qs({ book: '', intent: '' })} className="btn-ghost btn-sm">Exit booking</Link>
          ) : (
            <>
              <Link href={qs({ view: 'day', book: '1', intent: 'quote' })} className="btn-ghost btn-sm">Quote</Link>
              <Link href={qs({ view: 'day', book: '1' })} className="btn-gold btn-sm">Book</Link>
            </>
          )}
        </div>
      </header>

      {bookMode && (
        <p className="card border-l-4 p-3 text-sm text-body" style={{ borderLeftColor: 'var(--accent)' }}>
          <b>{bookIntent === 'quote' ? 'Quote mode — selections become a tentative hold.' : 'Booking mode.'}</b> Click hour blocks on the grid to pick exact times,
          or click facility names on the left to pick whole facilities (you set
          dates &amp; times on the next screen). Mix both freely, then Continue.
        </p>
      )}

      {/* Filters - location first, then facility (spec ordering) */}
      <form method="get" action="/schedule" className="card flex flex-wrap items-end gap-3 p-4">
        <input type="hidden" name="view" value={view} />
        <input type="hidden" name="date" value={date} />
        <div className="min-w-48">
          <label className="field-label" htmlFor="location">Location</label>
          <select id="location" name="location" className="input" defaultValue={searchParams.location ?? ''}>
            <option value="">All — Orangeville</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <div className="min-w-56 flex-1">
          <label className="field-label" htmlFor="facilities">Facility</label>
          <select id="facilities" name="facilities" className="input" defaultValue={searchParams.facilities ?? ''}>
            <option value="">All facilities</option>
            {facilityChoices.map((f) => (
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
          if (v.filters.location) p.set('location', v.filters.location);
          if (v.facility_ids.length) p.set('facilities', v.facility_ids.join(','));
          if (v.filters.source) p.set('source', v.filters.source);
          if (v.filters.status) p.set('status', v.filters.status);
          if (v.filters.internal) p.set('internal', v.filters.internal);
          const canDelete = v.shared || v.created_by === session.userId;
          return (
            <span key={v.id} className="flex items-center gap-1">
              <Link
                href={`/schedule?${p.toString()}`}
                className="tag hover:border-ink hover:text-ink"
                title={v.shared ? 'Shared with all staff' : 'Only you see this view'}
              >
                {v.name}
                {v.shared && <span style={{ color: 'var(--accent)' }}>· all</span>}
              </Link>
              {canDelete && (
                <form action={deleteViewAction}>
                  <input type="hidden" name="viewId" value={v.id} />
                  <button type="submit" className="text-[11px] text-silver hover:text-neg" title="Delete view">×</button>
                </form>
              )}
            </span>
          );
        })}
        <form action={saveViewAction} className="flex items-center gap-2">
          <input type="hidden" name="location" value={searchParams.location ?? ''} />
          <input type="hidden" name="facilities" value={searchParams.facilities ?? ''} />
          <input type="hidden" name="source" value={searchParams.source ?? ''} />
          <input type="hidden" name="status" value={searchParams.status ?? ''} />
          <input type="hidden" name="internal" value={searchParams.internal ?? ''} />
          <input name="name" required placeholder="Save current as…" className="input max-w-44 text-sm" />
          <button type="submit" name="scope" value="me" className="btn-ghost btn-sm">Save for me</button>
          <button type="submit" name="scope" value="all" className="btn-gold btn-sm">Save for all</button>
        </form>
      </div>

      {view === 'day' && (() => {
        let groups = ganttForDay(tree, bookings, date, parentIds, conflictedIds);
        if (hideUnbooked) {
          groups = groups
            .map((g) => ({ ...g, rows: g.rows.filter((r) => r.bars.length > 0) }))
            .filter((g) => g.rows.length > 0 || g.wholeBars.length > 0);
        }
        return <DayGantt groups={groups} dateISO={date} nowFrac={nowFrac} bookMode={bookMode} bookIntent={bookIntent} />;
      })()}

      {view === 'week' && (
        <div className="grid gap-3 md:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => addDaysISO(addDaysISO(date, -3), i)).map((d) => {
            const day = (bookingsByDate(bookings).get(d) ?? []).sort((x, y) => x.starts_at.localeCompare(y.starts_at));
            const weekday = new Date(`${d}T12:00:00Z`).toLocaleDateString('en-CA', { weekday: 'short' });
            return (
              <div key={d} className={`card flex flex-col ${d === date ? 'border-2' : ''}`} style={d === date ? { borderColor: 'var(--accent)' } : undefined}>
                <Link
                  href={qs({ view: 'day', date: d })}
                  className="flex items-baseline justify-between border-b border-hairline px-3 py-2 hover:bg-paper-panel"
                >
                  <span className="label text-[10px]">{weekday}</span>
                  <span className="mono text-sm font-bold text-ink">{d.slice(8)}</span>
                </Link>
                <div className="flex flex-col gap-1.5 p-2">
                  {day.map((b) => (
                    <div
                      key={b.id}
                      className="flex flex-col gap-0.5 border border-hairline px-2 py-1.5"
                      style={{ borderLeft: `3px solid ${conflictedIds.has(b.id) ? '#b4483c' : SOURCE_COLOR[b.source] ?? 'var(--accent)'}` }}
                      title={b.title}
                    >
                      <span className="mono whitespace-nowrap text-[10px] tabular-nums text-silver">
                        {fmtTime(b.starts_at)} – {fmtTime(b.ends_at)}
                      </span>
                      <span className={`text-[11px] font-semibold leading-tight ${conflictedIds.has(b.id) ? 'text-neg' : 'text-ink'}`}>
                        {conflictedIds.has(b.id) ? '⚠ ' : ''}{b.title}
                        {b.status === 'tentative' ? ' (hold)' : ''}
                      </span>
                    </div>
                  ))}
                  {day.length === 0 && <span className="px-1 text-[11px] text-silver">—</span>}
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
            const row = (b: BookingRecord) => (
              <p key={b.id} className={`truncate text-[10px] ${conflictedIds.has(b.id) ? 'font-bold text-neg' : 'text-ink'}`} title={b.title}>
                {b.title}
              </p>
            );
            return (
              <div key={d} className={`card min-h-20 p-2 ${inMonth ? '' : 'opacity-40'}`}>
                <Link href={qs({ view: 'day', date: d })} className="mono block text-[10px] text-silver hover:text-ink" title="Open day view">
                  {d.slice(8)}
                </Link>
                {day.slice(0, 3).map(row)}
                {day.length > 3 && (
                  // expands IN PLACE - the date number above is the day-view link
                  <details>
                    <summary className="cursor-pointer list-none text-[10px] text-silver hover:text-ink">
                      +{day.length - 3} more
                    </summary>
                    {day.slice(3).map(row)}
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
