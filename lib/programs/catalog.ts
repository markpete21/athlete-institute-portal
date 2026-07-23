import 'server-only';
import { ageEligible, spotsRemaining, type ProgramCategory } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Public catalog + abandoned-cart capture (Module 4 Stage 8).
 * The catalog shows only publicly-visible statuses and supports the spec's
 * filters; flow events log where people drop for retargeting.
 */

const PUBLIC_STATUSES = ['published', 'registration_open', 'full'];

export interface CatalogFilters {
  category?: ProgramCategory;
  sport?: string;
  typeKey?: string;
  brandKey?: string;
  seasonKey?: string;
  age?: number;          // eligibility by DOB-equivalent age
  facilityId?: number;   // program has a session in this facility's subtree
}

export interface CatalogItem {
  id: number;
  name: string;
  description: string | null;
  category: string;
  brand_key: string;
  sport_tag: string | null;
  type_name: string;
  base_price_cents: number;
  min_age: number | null;
  max_age: number | null;
  status: string;
  share_token: string;
  spots_left: number | null;
}

export async function listPublicPrograms(filters: CatalogFilters = {}): Promise<CatalogItem[]> {
  const db = supabaseAdmin();
  let q = db
    .from('programs')
    .select('id, name, description, category, brand_key, sport_tag, base_price_cents, min_age, max_age, status, share_token, capacity, program_types(key, name)')
    .in('status', PUBLIC_STATUSES);
  if (filters.category) q = q.eq('category', filters.category);
  if (filters.brandKey) q = q.eq('brand_key', filters.brandKey);
  if (filters.seasonKey) q = q.eq('season_key', filters.seasonKey);
  if (filters.sport) q = q.ilike('sport_tag', `%${filters.sport}%`);

  const { data, error } = await q.order('name');
  if (error) throw new Error(error.message);

  let rows = (data ?? []).map((p) => {
    const t = p.program_types as unknown as { key: string; name: string };
    return { ...p, type_key: t.key, type_name: t.name };
  });

  if (filters.typeKey) rows = rows.filter((r) => r.type_key === filters.typeKey);
  if (filters.age != null) {
    // Treat the requested age directly (catalog filter is by age, not DOB).
    rows = rows.filter((r) => (r.min_age == null || filters.age! >= r.min_age) && (r.max_age == null || filters.age! <= r.max_age));
  }
  if (filters.facilityId) {
    const { descendantIds } = await import('@ai/foundation');
    const { data: fac } = await db.from('facilities').select('id, parent_id, name, label, sort_order, bookable, deleted_at').is('deleted_at', null);
    const scope = new Set<number>([filters.facilityId, ...descendantIds((fac ?? []) as never[], filters.facilityId)]);
    const { data: sess } = await db.from('program_sessions').select('program_id, booking_id, bookings(facility_id)').in('program_id', rows.map((r) => r.id));
    const programsInScope = new Set((sess ?? []).filter((s) => scope.has((s.bookings as unknown as { facility_id: number } | null)?.facility_id ?? -1)).map((s) => s.program_id));
    rows = rows.filter((r) => programsInScope.has(r.id));
  }

  // Spots left per program.
  const out: CatalogItem[] = [];
  for (const r of rows) {
    const { count } = await db.from('registrations').select('id', { count: 'exact', head: true }).eq('program_id', r.id).eq('status', 'active');
    out.push({
      id: r.id, name: r.name, description: r.description, category: r.category, brand_key: r.brand_key, sport_tag: r.sport_tag,
      type_name: r.type_name, base_price_cents: r.base_price_cents, min_age: r.min_age, max_age: r.max_age, status: r.status, share_token: r.share_token,
      spots_left: spotsRemaining(r.capacity, count ?? 0, 0),
    });
  }
  return out;
}

export async function getProgramByToken(token: string): Promise<CatalogItem | null> {
  const items = await (async () => {
    const { data } = await supabaseAdmin()
      .from('programs')
      .select('id, name, description, category, brand_key, sport_tag, base_price_cents, min_age, max_age, status, share_token, capacity, program_types(name)')
      .eq('share_token', token)
      .maybeSingle();
    return data;
  })();
  if (!items) return null;
  const t = items.program_types as unknown as { name: string };
  const { count } = await supabaseAdmin().from('registrations').select('id', { count: 'exact', head: true }).eq('program_id', items.id).eq('status', 'active');
  return {
    id: items.id, name: items.name, description: items.description, category: items.category, brand_key: items.brand_key, sport_tag: items.sport_tag,
    type_name: t.name, base_price_cents: items.base_price_cents, min_age: items.min_age, max_age: items.max_age, status: items.status, share_token: items.share_token,
    spots_left: spotsRemaining(items.capacity, count ?? 0, 0),
  };
}

// --- Abandoned-cart capture -------------------------------------------------

export async function logFlowEvent(stage: 'browsing' | 'in_cart' | 'at_payment' | 'completed' | 'abandoned', ctx: { programId?: number | null; profileId?: number | null; familyId?: number | null; email?: string | null }): Promise<void> {
  const { error } = await supabaseAdmin().from('registration_flow_events').insert({
    program_id: ctx.programId ?? null, profile_id: ctx.profileId ?? null, family_id: ctx.familyId ?? null, email: ctx.email ?? null, stage,
  });
  if (error) console.error('[flow-event]', error.message); // never block the flow on logging
}

export interface RetargetRow {
  program_id: number | null;
  email: string | null;
  last_stage: string;
  last_at: string;
}

/**
 * Retargeting list: people whose LATEST flow event for a program is in_cart or
 * at_payment (they dropped without completing). Feeds the Communications module.
 */
export async function retargetingList(sinceDays = 30): Promise<RetargetRow[]> {
  const { data, error } = await supabaseAdmin()
    .from('registration_flow_events')
    .select('program_id, email, stage, created_at')
    .gte('created_at', new Date(Date.now() - sinceDays * 86400_000).toISOString())
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  // Latest event per (email, program).
  const latest = new Map<string, RetargetRow>();
  for (const e of data ?? []) {
    const key = `${e.email ?? 'anon'}:${e.program_id ?? 0}`;
    if (!latest.has(key)) latest.set(key, { program_id: e.program_id, email: e.email, last_stage: e.stage, last_at: e.created_at });
  }
  return [...latest.values()].filter((r) => r.last_stage === 'in_cart' || r.last_stage === 'at_payment');
}
