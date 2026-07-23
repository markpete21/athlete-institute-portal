import { buildTree, flattenTree, type FacilityNode } from '@ai/foundation';
import { listFacilities } from '@/lib/facilities';
import {
  createFacilityAction,
  moveFacilityAction,
  reorderFacilityAction,
  restoreFacilityAction,
  softDeleteFacilityAction,
  updateFacilityAction,
} from './actions';

export const dynamic = 'force-dynamic';

/**
 * Facility tree editor (Module 2 Stage 1): add/edit/reorder/nest to arbitrary
 * depth, bookable flag, soft-delete + restore. Bookings hang off these nodes
 * from Stage 2 on.
 */
export default async function FacilitiesAdminPage() {
  const all = await listFacilities(true);
  const live = all.filter((f) => !f.deleted_at);
  const deleted = all.filter((f) => !!f.deleted_at);
  const ordered = flattenTree(buildTree(live));

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <p className="label text-[11px]">Admin · Facilities</p>
        <h1 className="text-5xl">
          Facility tree<span style={{ color: 'var(--accent)' }}>.</span>
        </h1>
        <p className="text-body">
          Any node can nest to any depth. Booking a node occupies all its
          descendants; two booked halves occupy their parent — that math arrives
          in Stage 2 and reads THIS tree.
        </p>
      </header>

      <section className="flex flex-col gap-1">
        {ordered.map((node) => (
          <div key={node.id} className="card flex flex-wrap items-center gap-2 px-4 py-2" style={{ marginLeft: `${node.depth * 24}px` }}>
            <form action={updateFacilityAction} className="flex flex-1 flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={node.id} />
              <input name="name" defaultValue={node.name} className="input max-w-64 text-sm" />
              <input name="label" defaultValue={node.label ?? ''} placeholder="label" className="input max-w-28 text-sm" />
              <label className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.1em] text-silver">
                <input type="checkbox" name="bookable" defaultChecked={node.bookable} /> bookable
              </label>
              <button type="submit" className="btn-ghost btn-sm">Save</button>
            </form>

            <form action={reorderFacilityAction} className="flex gap-1">
              <input type="hidden" name="id" value={node.id} />
              <button name="direction" value="up" className="btn-ghost btn-sm" type="submit">↑</button>
              <button name="direction" value="down" className="btn-ghost btn-sm" type="submit">↓</button>
            </form>

            <form action={moveFacilityAction} className="flex items-center gap-1">
              <input type="hidden" name="id" value={node.id} />
              <select name="parentId" defaultValue={node.parent_id ?? ''} className="input max-w-44 text-sm">
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
        ))}
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
                <option key={f.id} value={f.id}>{' '.repeat(f.depth * 2)}{f.name}</option>
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
