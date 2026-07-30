import 'server-only';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { headerBrands, type BrandRow } from '@/lib/brands/brands';

/**
 * Brand tiles for the Play App header: each brand plus its live programs, so
 * hovering a tile can show "N active programs" and the dropdown can list them.
 * Logos come from Admin > Brands (public brand-assets bucket); a brand with no
 * uploaded logo falls back to a monogram in the UI.
 */

export interface BrandProgram {
  id: number;
  name: string;
  spotsLabel: string;
  scheduleLabel: string | null;
}

export interface BrandTile extends BrandRow {
  programs: BrandProgram[];
}

/** Open programs grouped by brand, ordered for the header. */
export async function brandTiles(): Promise<BrandTile[]> {
  const db = supabaseAdmin();
  const brands = await headerBrands();

  const { data: programs } = await db
    .from('programs')
    .select('id, name, brand_key, capacity, status, registration_opens_at, season_key')
    .in('status', ['published', 'registration_open', 'full'])
    .order('registration_opens_at', { nullsFirst: false })
    .limit(200);

  // Active-registration counts in one pass so we can label spots.
  const ids = (programs ?? []).map((p) => p.id);
  const counts = new Map<number, number>();
  if (ids.length) {
    const { data: regs } = await db.from('registrations').select('program_id').in('program_id', ids).eq('status', 'active');
    for (const r of regs ?? []) counts.set(r.program_id, (counts.get(r.program_id) ?? 0) + 1);
  }

  const byBrand = new Map<string, BrandProgram[]>();
  for (const p of programs ?? []) {
    const taken = counts.get(p.id) ?? 0;
    const left = p.capacity == null ? null : Math.max(0, p.capacity - taken);
    const spotsLabel =
      p.status === 'full' || left === 0 ? 'Waitlist' : left == null ? 'Open' : `${left} spot${left === 1 ? '' : 's'}`;
    const list = byBrand.get(p.brand_key ?? 'athlete-institute') ?? [];
    list.push({
      id: p.id,
      name: p.name,
      spotsLabel,
      scheduleLabel: p.season_key ?? (p.registration_opens_at ? new Date(p.registration_opens_at).toLocaleDateString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric' }) : null),
    });
    byBrand.set(p.brand_key ?? 'athlete-institute', list);
  }

  return brands.map((b) => ({ ...b, programs: (byBrand.get(b.key) ?? []).slice(0, 6) }));
}
