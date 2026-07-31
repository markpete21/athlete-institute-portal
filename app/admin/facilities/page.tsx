import { buildTree, effectiveHoursOn, flattenTree, type FacilityNode } from '@ai/foundation';
import { listClosures, listFacilities, type FacilityRow } from '@/lib/facilities';
import { listLocations } from '@/lib/locations';
import {
  createClosureAction,
  createFacilityAction,
  createLocationAction,
  deleteClosureAction,
  moveFacilityAction,
  reorderFacilityAction,
  restoreFacilityAction,
  softDeleteFacilityAction,
  updateFacilityAction,
  updateHoursAction,
  updateLocationBindingAction,
} from './actions';

export const dynamic = 'force-dynamic';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Human summary of a node's effective week, collapsing runs of identical days
 * ("Mon-Fri 09:00-22:00 · Sat-Sun 08:00-22:00"). Reads through inheritance, so
 * a basket shows the hours it actually operates under, not a blank.
 */
function summariseWeek(tree: FacilityRow[], id: number): string {
  const week = Array.from({ length: 7 }, (_, d) => {
    const h = effectiveHoursOn(tree, id, d);
    return h.closed ? 'Closed' : `${h.open}-${h.close}`;
  });
  const runs: Array<{ from: number; to: number; text: string }> = [];
  week.forEach((text, d) => {
    const last = runs[runs.length - 1];
    if (last && last.text === text) last.to = d;
    else runs.push({ from: d, to: d, text });
  });
  return runs
    .map((r) => `${r.from === r.to ? DAYS[r.from] : `${DAYS[r.from]}-${DAYS[r.to]}`} ${r.text}`)
    .join(' · ');
}

/**
 * Facility tree editor (Module 2 Stage 1, extended in review): add/edit/
 * reorder/nest, bookable flag, soft-delete + restore, plus weekday operating
 * hours, the reporting-location binding, and seasonal closures.
 */
export default async function FacilitiesAdminPage() {
  const [all, locations, closures] = await Promise.all([
    listFacilities(true),
    listLocations(),
    listClosures(),
  ]);
  const live = all.filter((f) => !f.deleted_at);
  const deleted = all.filter((f) => !!f.deleted_at);
  const ordered = flattenTree(buildTree(live));
  const nameOf = (id: number) => live.find((f) => f.id === id)?.name ?? `#${id}`;

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <p className="label text-[11px]">Admin · Facilities</p>
        <h1 className="text-5xl">
          Facility tree<span style={{ color: 'var(--accent)' }}>.</span>
        </h1>
        <p className="text-body">
          Any node can nest to any depth. Booking a node occupies all its
          descendants; two booked halves occupy their parent. Hours, closures and
          the reporting location all inherit down the tree — set them at the
          highest node that applies.
        </p>
      </header>

      <section className="flex flex-col gap-1">
        {ordered.map((node) => {
          const row = live.find((f) => f.id === node.id)!;
          const ownWindows = row.hours_windows ?? null;
          const byWeekday = new Map((ownWindows ?? []).map((w) => [Number(w.weekday), w]));

          return (
            <div key={node.id} className="card flex flex-col px-3 py-1.5" style={{ marginLeft: `${node.depth * 20}px` }}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <form action={updateFacilityAction} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={node.id} />
                  <input name="name" defaultValue={node.name} className="input h-8 min-w-44 max-w-64 flex-1 text-sm" />
                  <input name="label" defaultValue={node.label ?? ''} placeholder="label" className="input h-8 w-24 text-sm" />
                  <label className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em] text-silver" title="Bookable">
                    <input type="checkbox" name="bookable" defaultChecked={node.bookable} /> book
                  </label>
                  <button type="submit" className="btn-ghost btn-sm">Save</button>
                </form>

                <form action={reorderFacilityAction} className="flex gap-0.5">
                  <input type="hidden" name="id" value={node.id} />
                  <button name="direction" value="up" className="btn-ghost btn-sm px-2" type="submit" title="Move up">↑</button>
                  <button name="direction" value="down" className="btn-ghost btn-sm px-2" type="submit" title="Move down">↓</button>
                </form>

                <form action={moveFacilityAction} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={node.id} />
                  <select name="parentId" defaultValue={node.parent_id ?? ''} className="input h-8 max-w-40 text-sm">
                    <option value="">(root)</option>
                    {live.filter((f) => f.id !== node.id).map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                  <button type="submit" className="btn-ghost btn-sm">Move</button>
                </form>

                <form action={softDeleteFacilityAction}>
                  <input type="hidden" name="id" value={node.id} />
                  <button type="submit" className="btn-ghost btn-sm text-neg">Delete</button>
                </form>
              </div>

              <details className="mt-1 border-t border-hairline pt-1">
                <summary className="cursor-pointer py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-silver">
                  Hours &amp; location
                  <span className="ml-2 normal-case tracking-normal text-body">
                    {summariseWeek(live, node.id)}
                    {!ownWindows && <span className="text-silver"> (inherited)</span>}
                  </span>
                </summary>

                <div className="flex flex-col gap-3 pt-3">
                  <form action={updateHoursAction} className="flex flex-col gap-2">
                    <input type="hidden" name="id" value={node.id} />
                    <div className="grid max-w-3xl grid-cols-4 gap-2 sm:grid-cols-7">
                      {DAYS.map((d, weekday) => {
                        const w = byWeekday.get(weekday);
                        return (
                          <div key={d} className="flex flex-col gap-1">
                            <span className="field-label">{d}</span>
                            <input type="time" name={`open-${weekday}`} defaultValue={w?.open ?? ''} className="input h-8 px-1.5 text-xs" />
                            <input type="time" name={`close-${weekday}`} defaultValue={w?.close ?? ''} className="input h-8 px-1.5 text-xs" />
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-sm text-silver">
                      Leave a day blank to mark it closed. Saving with every day
                      blank, or ticking inherit, clears this node&apos;s override.
                      Hours are advisory — staff can still book outside them.
                    </p>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.1em] text-silver">
                        <input type="checkbox" name="inherit" /> inherit from parent
                      </label>
                      <button type="submit" className="btn-ghost btn-sm">Save hours</button>
                    </div>
                  </form>

                  <form action={updateLocationBindingAction} className="flex items-end gap-2 border-t border-hairline pt-3">
                    <input type="hidden" name="id" value={node.id} />
                    <div>
                      <label className="field-label" htmlFor={`loc-${node.id}`}>Reporting location</label>
                      <select id={`loc-${node.id}`} name="locationId" defaultValue={row.location_id ?? ''} className="input h-8 text-sm">
                        <option value="">(inherit from parent)</option>
                        {locations.map((l) => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                    </div>
                    <button type="submit" className="btn-ghost btn-sm">Save location</button>
                  </form>
                </div>
              </details>
            </div>
          );
        })}
      </section>

      <section className="card flex flex-col gap-4 p-6">
        <h2 className="text-2xl">Add a facility</h2>
        <form action={createFacilityAction} className="grid gap-3 sm:grid-cols-[2fr_1fr_2fr_auto_auto]">
          <div>
            <label className="field-label" htmlFor="new-name">Name</label>
            <input id="new-name" name="name" required className="input" />
          </div>
          <div>
            <label className="field-label" htmlFor="new-label">Label</label>
            <input id="new-label" name="label" placeholder="Court, Basket…" className="input" />
          </div>
          <div>
            <label className="field-label" htmlFor="new-parent">Parent</label>
            <select id="new-parent" name="parentId" className="input" defaultValue="">
              <option value="">(root)</option>
              {ordered.map((f) => (
                <option key={f.id} value={f.id}>{' '.repeat(f.depth * 2)}{f.name}</option>
              ))}
            </select>
          </div>
          <label className="flex items-end gap-1 pb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-silver">
            <input type="checkbox" name="bookable" defaultChecked /> bookable
          </label>
          <div className="flex items-end">
            <button type="submit" className="btn-gold btn-sm">Add</button>
          </div>
        </form>
      </section>

      <section className="card flex flex-col gap-4 p-6">
        <div>
          <h2 className="text-2xl">Seasonal closures</h2>
          <p className="text-sm text-silver">
            Date ranges when a facility is unavailable — outdoor spaces over the
            winter, holiday shutdowns. A closure cascades to every child node.
            Advisory, like hours.
          </p>
        </div>

        {closures.length === 0 ? (
          <p className="text-sm text-silver">No closures configured.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {closures.map((c) => (
              <li key={c.id} className="flex items-center gap-3 text-sm">
                <span className="mono">{c.starts_on} → {c.ends_on}</span>
                <span>{nameOf(c.facility_id)}</span>
                {c.reason && <span className="text-silver">{c.reason}</span>}
                <form action={deleteClosureAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <button type="submit" className="btn-ghost btn-sm text-neg">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <form action={createClosureAction} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_2fr_auto]">
          <div>
            <label className="field-label" htmlFor="cl-facility">Facility</label>
            <select id="cl-facility" name="facilityId" className="input" required>
              {ordered.map((f) => (
                <option key={f.id} value={f.id}>{' '.repeat(f.depth * 2)}{f.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="cl-start">From</label>
            <input id="cl-start" type="date" name="startsOn" required className="input" />
          </div>
          <div>
            <label className="field-label" htmlFor="cl-end">To</label>
            <input id="cl-end" type="date" name="endsOn" required className="input" />
          </div>
          <div>
            <label className="field-label" htmlFor="cl-reason">Reason</label>
            <input id="cl-reason" name="reason" placeholder="Winter — outdoor" className="input" />
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn-gold btn-sm">Add</button>
          </div>
        </form>
      </section>

      <section className="card flex flex-col gap-4 p-6">
        <div>
          <h2 className="text-2xl">Locations</h2>
          <p className="text-sm text-silver">
            The reporting and accounting dimension — revenue, margin and the
            QuickBooks Location mapping group by these. Bind each site node above
            to its location; everything beneath inherits it.
          </p>
        </div>

        <ul className="flex flex-col gap-1 text-sm">
          {locations.map((l) => {
            const bound = live.filter((f) => f.location_id === l.id).map((f) => f.name);
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-3">
                <span>{l.name}</span>
                {l.city && <span className="text-silver">{l.city}</span>}
                <span className="text-silver">
                  {bound.length > 0 ? `bound to ${bound.join(', ')}` : 'not bound to the tree'}
                </span>
              </li>
            );
          })}
        </ul>

        <form action={createLocationAction} className="grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
          <div>
            <label className="field-label" htmlFor="loc-name">Name</label>
            <input id="loc-name" name="name" required className="input" />
          </div>
          <div>
            <label className="field-label" htmlFor="loc-city">City</label>
            <input id="loc-city" name="city" className="input" />
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn-gold btn-sm">Add</button>
          </div>
        </form>
      </section>

      {deleted.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-2xl">Deleted</h2>
          {deleted.map((f: FacilityNode) => (
            <form key={f.id} action={restoreFacilityAction} className="flex items-center gap-3 text-sm">
              <input type="hidden" name="id" value={f.id} />
              <span className="text-silver line-through">{f.name}</span>
              <button type="submit" className="btn-ghost btn-sm">Restore</button>
            </form>
          ))}
        </section>
      )}
    </main>
  );
}
