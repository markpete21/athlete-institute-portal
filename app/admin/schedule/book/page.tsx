import { ancestorIds, buildTree, flattenTree } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { listAddons, listRates, resolveRate } from '@/lib/rentals/rates';
import { torontoDateOf } from '@/lib/schedule-views';
import { Wizard, type WizardFacility } from './Wizard';

export const dynamic = 'force-dynamic';

/**
 * The booking wizard (reached from the BOOK button on the master schedule).
 * Prefill arrives in the URL:
 *   ?date=YYYY-MM-DD&slots=<facilityId>_<HH:MM>_<HH:MM>,...   time blocks
 *   ?date=YYYY-MM-DD&facilities=1,2,3                          facility-first
 */
export default async function BookPage({
  searchParams,
}: {
  searchParams: { date?: string; slots?: string; facilities?: string };
}) {
  const db = supabaseAdmin();
  const [{ data: facRows }, { data: unitRows }, { data: orgRows }, rates, addons] = await Promise.all([
    db.from('facilities').select('id, parent_id, name, label, sort_order, bookable, deleted_at').is('deleted_at', null),
    db.from('business_units').select('id, name').eq('active', true).order('name'),
    db.from('organizations').select('id, name').eq('status', 'active').order('name'),
    listRates(),
    listAddons(),
  ]);

  const tree = (facRows ?? []) as Parameters<typeof buildTree>[0];
  const ordered = flattenTree(buildTree(tree));

  // Effective rates precomputed per facility (rate-card inheritance walk-up),
  // so the client never needs the rate table or the tree.
  const facilities: WizardFacility[] = ordered
    .filter((f) => f.bookable)
    .map((f) => {
      const chain = [f.id, ...ancestorIds(tree, f.id)];
      return {
        id: f.id,
        name: f.name,
        depth: f.depth,
        hourlyCents: resolveRate(rates, chain, 'hourly'),
        fullDayCents: resolveRate(rates, chain, 'full_day'),
      };
    });

  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? '')
    ? searchParams.date!
    : torontoDateOf(new Date().toISOString());

  // slots=13_18:00_20:00,14_18:00_19:30
  const slots = (searchParams.slots ?? '')
    .split(',')
    .map((s) => s.split('_'))
    .filter((p): p is [string, string, string] => p.length === 3)
    .map(([fid, start, end]) => ({ facilityId: Number(fid), start, end }))
    .filter((s) => facilities.some((f) => f.id === s.facilityId));

  const preFacilities = (searchParams.facilities ?? '')
    .split(',')
    .map(Number)
    .filter((id) => facilities.some((f) => f.id === id));

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2 border-b border-hairline pb-5">
        <p className="label text-[11px]">Admin · Master schedule</p>
        <h1 className="text-4xl">
          Book<span style={{ color: 'var(--accent)' }}>.</span>
        </h1>
      </header>

      <Wizard
        facilities={facilities}
        businessUnits={(unitRows ?? []) as Array<{ id: number; name: string }>}
        organizations={(orgRows ?? []) as Array<{ id: number; name: string }>}
        addons={addons.map((a) => ({ id: a.id, name: a.name, pricingMode: a.pricing_mode, priceCents: a.default_price_cents }))}
        defaultDate={date}
        prefillSlots={slots}
        prefillFacilities={preFacilities}
      />
    </main>
  );
}
