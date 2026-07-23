import { buildTree, flattenTree, type FacilityNode } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { listAddons, listRates } from '@/lib/rentals/rates';
import { saveAddonAction, savePublicOpenAction, saveRateAction } from './actions';

export const dynamic = 'force-dynamic';

const dollars = (cents: number | null) => (cents == null ? '' : (cents / 100).toFixed(2));

/**
 * Rental settings (Module 3 Stage 1): per-facility default rates (hourly /
 * full-day / flat - children inherit the nearest ancestor's rate), the add-on
 * library, and the public-open self-serve flags.
 */
export default async function RentalSettingsPage() {
  const [{ data: facRows }, rates, addons] = await Promise.all([
    supabaseAdmin()
      .from('facilities')
      .select('id, parent_id, name, label, sort_order, bookable, deleted_at, public_open')
      .is('deleted_at', null),
    listRates(),
    listAddons(true),
  ]);
  const tree = (facRows ?? []) as Array<FacilityNode & { public_open: boolean }>;
  const ordered = flattenTree(buildTree(tree)) as Array<FacilityNode & { public_open?: boolean; depth: number }>;
  const rateOf = new Map(rates.map((r) => [r.facility_id, r]));
  const publicOf = new Map(tree.map((f) => [f.id, f.public_open]));

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <p className="label text-[11px]">Admin · Rentals</p>
        <h1 className="text-5xl">
          Rental settings<span style={{ color: 'var(--accent)' }}>.</span>
        </h1>
        <p className="text-body">
          Default rates per facility (blank = inherits the nearest parent rate;
          quote lines can override). Public-open facilities are self-serve
          bookable online - everything else is quote-only.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Rates</h2>
        <div className="card overflow-x-auto">
          <table className="data-table min-w-[720px]">
            <thead>
              <tr>
                <th>Facility</th>
                <th>Hourly $</th>
                <th>Full day $</th>
                <th>Flat $</th>
                <th>Public-open</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ordered.filter((f) => f.bookable).map((f) => {
                const r = rateOf.get(f.id);
                return (
                  <tr key={f.id}>
                    <td className="text-ink" style={{ paddingLeft: `${16 + f.depth * 18}px` }}>{f.name}</td>
                    <td colSpan={4} className="p-0">
                      <div className="flex items-center gap-2 px-2 py-1">
                        <form action={saveRateAction} className="flex items-center gap-2">
                          <input type="hidden" name="facilityId" value={f.id} />
                          <input name="hourly" defaultValue={dollars(r?.hourly_cents ?? null)} placeholder="—" className="input w-24 text-sm" />
                          <input name="fullDay" defaultValue={dollars(r?.full_day_cents ?? null)} placeholder="—" className="input w-24 text-sm" />
                          <input name="flat" defaultValue={dollars(r?.flat_cents ?? null)} placeholder="—" className="input w-24 text-sm" />
                          <button type="submit" className="btn-ghost btn-sm">Save</button>
                        </form>
                        <form action={savePublicOpenAction} className="flex items-center gap-2">
                          <input type="hidden" name="facilityId" value={f.id} />
                          <label className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.1em] text-silver">
                            <input type="checkbox" name="publicOpen" defaultChecked={publicOf.get(f.id) ?? false} /> open
                          </label>
                          <button type="submit" className="btn-ghost btn-sm">Set</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Add-on library</h2>
        {addons.map((a) => (
          <form key={a.id} action={saveAddonAction} className="card flex flex-wrap items-end gap-3 p-4">
            <input type="hidden" name="name" value={a.name} />
            <div className="min-w-40">
              <span className="field-label">{a.name}</span>
              <input name="description" defaultValue={a.description ?? ''} placeholder="description" className="input text-sm" />
            </div>
            <div>
              <label className="field-label">Mode</label>
              <select name="pricingMode" defaultValue={a.pricing_mode} className="input text-sm">
                <option value="flat">Flat</option>
                <option value="per_unit">Per unit</option>
                <option value="per_hour">Per hour</option>
              </select>
            </div>
            <div>
              <label className="field-label">Price $</label>
              <input name="price" defaultValue={dollars(a.default_price_cents)} className="input w-24 text-sm" />
            </div>
            <label className="flex items-center gap-1 pb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-silver">
              <input type="checkbox" name="active" defaultChecked={a.active} /> active
            </label>
            <button type="submit" className="btn-ghost btn-sm">Save</button>
          </form>
        ))}

        <form action={saveAddonAction} className="card flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-40">
            <label className="field-label">New add-on</label>
            <input name="name" placeholder="Name" required className="input text-sm" />
          </div>
          <div className="min-w-40">
            <label className="field-label">Description</label>
            <input name="description" className="input text-sm" />
          </div>
          <div>
            <label className="field-label">Mode</label>
            <select name="pricingMode" defaultValue="flat" className="input text-sm">
              <option value="flat">Flat</option>
              <option value="per_unit">Per unit</option>
              <option value="per_hour">Per hour</option>
            </select>
          </div>
          <div>
            <label className="field-label">Price $</label>
            <input name="price" defaultValue="0.00" className="input w-24 text-sm" />
          </div>
          <label className="flex items-center gap-1 pb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-silver">
            <input type="checkbox" name="active" defaultChecked /> active
          </label>
          <button type="submit" className="btn-gold btn-sm">Add</button>
        </form>
      </section>
    </main>
  );
}
