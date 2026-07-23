import 'server-only';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Rental rates + add-on library (Module 3 Stage 1).
 * A quote line resolves its price from the facility's default for the chosen
 * rate mode, overridable per line (Stage 2 quote builder).
 */

export interface FacilityRate {
  facility_id: number;
  hourly_cents: number | null;
  full_day_cents: number | null;
  flat_cents: number | null;
}

export type RateMode = 'hourly' | 'full_day' | 'flat';

export interface AddonCatalogItem {
  id: number;
  name: string;
  description: string | null;
  pricing_mode: 'flat' | 'per_unit' | 'per_hour';
  default_price_cents: number;
  active: boolean;
}

export async function listRates(): Promise<FacilityRate[]> {
  const { data, error } = await supabaseAdmin()
    .from('facility_rates')
    .select('facility_id, hourly_cents, full_day_cents, flat_cents');
  if (error) throw new Error(error.message);
  return (data ?? []) as FacilityRate[];
}

export async function upsertRate(rate: FacilityRate, actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('facility_rates')
    .upsert(rate, { onConflict: 'facility_id' });
  if (error) throw new Error(`rate save failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'rental_rate.saved', target: `facility:${rate.facility_id}`, meta: { ...rate } });
}

/**
 * Resolve the default rate for a facility + mode, falling back to the nearest
 * ANCESTOR with a rate (set a rate on "Dome" and the courts inherit it).
 */
export function resolveRate(
  rates: FacilityRate[],
  ancestorChain: number[], // facility itself first, then ancestors (nearest first)
  mode: RateMode,
): number | null {
  const key = mode === 'hourly' ? 'hourly_cents' : mode === 'full_day' ? 'full_day_cents' : 'flat_cents';
  const byId = new Map(rates.map((r) => [r.facility_id, r]));
  for (const id of ancestorChain) {
    const v = byId.get(id)?.[key];
    if (v != null) return v;
  }
  return null;
}

export async function listAddons(includeInactive = false): Promise<AddonCatalogItem[]> {
  let q = supabaseAdmin()
    .from('rental_addons_catalog')
    .select('id, name, description, pricing_mode, default_price_cents, active')
    .order('name');
  if (!includeInactive) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as AddonCatalogItem[];
}

export async function upsertAddon(
  input: Omit<AddonCatalogItem, 'id'> & { id?: number },
  actorClerkId: string,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('rental_addons_catalog')
    .upsert(
      {
        ...(input.id ? { id: input.id } : {}),
        name: input.name.trim(),
        description: input.description?.trim() || null,
        pricing_mode: input.pricing_mode,
        default_price_cents: input.default_price_cents,
        active: input.active,
      },
      { onConflict: 'name' },
    );
  if (error) throw new Error(`addon save failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'rental_addon.saved', target: `addon:${input.name}`, meta: { pricing_mode: input.pricing_mode, price: input.default_price_cents } });
}

/** Flag a facility (and optional weekly windows) as self-serve bookable. */
export async function setPublicOpen(
  facilityId: number,
  open: boolean,
  windows: Array<{ weekday: number; start: string; end: string }> | null,
  actorClerkId: string,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('facilities')
    .update({ public_open: open, public_open_windows: windows })
    .eq('id', facilityId);
  if (error) throw new Error(`public-open save failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'facility.public-open', target: `facility:${facilityId}`, meta: { open, windows } });
}
