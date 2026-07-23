import { NextResponse } from 'next/server';
import { ancestorIds, type FacilityNode } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { listAddons, listRates, resolveRate, setPublicOpen, upsertAddon, upsertRate } from '@/lib/rentals/rates';

/**
 * DEV-ONLY: Stage-1 rentals config - rate upsert + ancestor inheritance,
 * add-on catalog (seeds + pricing-mode edit), public-open flag, business-unit
 * seeds. Cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const touchedFacilities: number[] = [];
  let addonName: string | null = null;

  try {
    const { data: facRows } = await db
      .from('facilities')
      .select('id, parent_id, name, label, sort_order, bookable, deleted_at')
      .is('deleted_at', null);
    const tree = (facRows ?? []) as FacilityNode[];
    const idOf = (name: string) => tree.find((f) => f.name === name)!.id;
    const dome = idOf('Dome');
    const court1 = idOf('Dome Court 1');
    const basketA = idOf('Court 1 - East Basket');

    // 1. rate on Dome; court + basket inherit; court override wins for court
    await upsertRate({ facility_id: dome, hourly_cents: 20000, full_day_cents: 150000, flat_cents: null }, 'system:verify');
    await upsertRate({ facility_id: court1, hourly_cents: 8000, full_day_cents: null, flat_cents: null }, 'system:verify');
    touchedFacilities.push(dome, court1);
    const rates = await listRates();
    const chainBasket = [basketA, ...ancestorIds(tree, basketA)];
    const chainCourt = [court1, ...ancestorIds(tree, court1)];
    record(
      'rate inheritance (basket->court override->Dome default)',
      resolveRate(rates, chainBasket, 'hourly') === 8000 &&
        resolveRate(rates, chainCourt, 'hourly') === 8000 &&
        resolveRate(rates, chainBasket, 'full_day') === 150000 &&
        resolveRate(rates, chainCourt, 'flat') === null,
      `basket hourly=${resolveRate(rates, chainBasket, 'hourly')}, basket full-day=${resolveRate(rates, chainBasket, 'full_day')}`,
    );

    // 2. add-on seeds present
    const addons = await listAddons();
    record(
      'add-on seeds',
      ['Live stream', 'Extra staff', 'Branding / signage', 'Media package'].every((n) => addons.some((a) => a.name === n)) &&
        addons.find((a) => a.name === 'Extra staff')!.pricing_mode === 'per_hour',
      addons.map((a) => a.name).join(', '),
    );

    // 3. add-on upsert + deactivate filtered from active list
    addonName = `Verify Addon ${Date.now()}`;
    await upsertAddon({ name: addonName, description: 'x', pricing_mode: 'per_unit', default_price_cents: 1234, active: false }, 'system:verify');
    const activeOnly = await listAddons();
    const withInactive = await listAddons(true);
    record(
      'addon upsert + active filter',
      !activeOnly.some((a) => a.name === addonName) && withInactive.some((a) => a.name === addonName && a.pricing_mode === 'per_unit'),
      'inactive addon hidden from active list',
    );

    // 4. public-open flag round-trip
    await setPublicOpen(court1, true, null, 'system:verify');
    const { data: fac } = await db.from('facilities').select('public_open').eq('id', court1).single();
    record('public-open flag', fac!.public_open === true, `court1 public_open=${fac!.public_open}`);

    // 5. business units seeded
    const { data: bus } = await db.from('business_units').select('name').order('name');
    record(
      'business units seeded',
      ['Bears Rep Basketball', 'Bears Volleyball Club', 'OP National Boys', 'OP National Girls'].every((n) => bus!.some((b) => b.name === n)),
      bus!.map((b) => b.name).join(', '),
    );
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (touchedFacilities.length) await db.from('facility_rates').delete().in('facility_id', touchedFacilities);
    if (addonName) await db.from('rental_addons_catalog').delete().eq('name', addonName);
    await db.from('facilities').update({ public_open: false, public_open_windows: null }).eq('public_open', true);
    record('cleanup', true, 'rates, test addon, public flags reset');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
