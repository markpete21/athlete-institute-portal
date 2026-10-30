import 'server-only';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { slugify } from '@/lib/site/blocks';

/**
 * Site-owned records: locations, programs (facts) and sports. These feed every
 * public page, menu card and interest form until Module 4 registration is
 * connected (site_programs.program_id links a record to its Module 4 program;
 * the pages don't change).
 */

export type LocationStatus = 'open' | 'opening_soon' | 'waitlist' | 'closed';

export interface SiteLocation {
  id: number;
  slug: string;
  name: string;
  city: string | null;
  region: string;
  venue: string | null;
  address: string | null;
  parking: string | null;
  arrival: string | null;
  contact: string | null;
  socialUrl: string | null;
  status: LocationStatus;
  launchLabel: string | null;
  sports: string[];
  note: string | null;
  photoUrl: string | null;
  photoAlt: string | null;
  /** Extra venue photos (e.g. Fieldhouse, Dome). */
  photos: { url: string; alt: string; caption: string }[];
  /** Program leadership shown on the location page: photo, name, role, short bio. */
  leaders: SiteLeader[];
  calendar: [string, string][];
  sortOrder: number;
}

export interface SiteLeader { name: string; role: string; bio: string; photoUrl: string | null }

export interface SiteProgram {
  id: number;
  slug: string;
  locationSlug: string;
  sport: string;
  leagueType: string;
  name: string;
  status: 'open' | 'coming_soon' | 'full' | 'closed' | 'archived';
  statusLabel: string | null;
  description: string | null;
  facts: [string, string][];
  programId: number | null;
  sortOrder: number;
}

export interface SportDef { slug: string; name: string; markUrl: string; status: 'live' | 'soon'; programs: [string, string][] }

/** The sport catalogue (slug, name, mark). Programs per sport come from records when live. */
export const SPORTS: SportDef[] = [
  { slug: 'basketball', name: 'Basketball', markUrl: '/sites/all-can/sports/basketball.png', status: 'live', programs: [['ALL CAN Basketball League', 'Youth league'], ['ALL CAN Basketball Skills', 'Youth skills'], ['ALL CAN Circuit', 'Rep circuit']] },
  { slug: 'volleyball', name: 'Volleyball', markUrl: '/sites/all-can/sports/volleyball.png', status: 'soon', programs: [['ALL CAN Volleyball League', 'League'], ['ALL CAN Volleyball Skills', 'Skills']] },
  { slug: 'soccer', name: 'Soccer', markUrl: '/sites/all-can/sports/soccer.png', status: 'soon', programs: [['ALL CAN Soccer League', 'League'], ['ALL CAN Soccer Skills', 'Skills']] },
  { slug: 'flag-football', name: 'Flag Football', markUrl: '/sites/all-can/sports/flag-football.png', status: 'soon', programs: [['ALL CAN Flag Football League', 'League']] },
];
export const sportBySlug = (slug: string) => SPORTS.find((s) => s.slug === slug) ?? null;

const LCOLS = 'id, slug, name, city, region, venue, address, parking, arrival, contact, social_url, status, launch_label, sports, note, photo_url, photo_alt, calendar, sort_order';
const PCOLS = 'id, slug, location_slug, sport, league_type, name, status, status_label, description, facts, program_id, sort_order';

const pairs = (v: unknown): [string, string][] => (Array.isArray(v) ? v.filter((p) => Array.isArray(p) && p.length >= 2).map((p) => [String(p[0]), String(p[1])]) : []);

function toLoc(r: Record<string, unknown>): SiteLocation {
  return {
    id: r.id as number, slug: r.slug as string, name: r.name as string, city: (r.city as string) ?? null, region: (r.region as string) ?? 'Ontario',
    venue: (r.venue as string) ?? null, address: (r.address as string) ?? null, parking: (r.parking as string) ?? null, arrival: (r.arrival as string) ?? null,
    contact: (r.contact as string) ?? null, socialUrl: (r.social_url as string) ?? null, status: (r.status as LocationStatus) ?? 'opening_soon',
    launchLabel: (r.launch_label as string) ?? null, sports: (r.sports as string[]) ?? [], note: (r.note as string) ?? null,
    photoUrl: (r.photo_url as string) ?? null, photoAlt: (r.photo_alt as string) ?? null, photos: Array.isArray(r.photos) ? (r.photos as { url: string; alt: string; caption: string }[]) : [], leaders: [], calendar: pairs(r.calendar), sortOrder: (r.sort_order as number) ?? 100,
  };
}
function toProg(r: Record<string, unknown>): SiteProgram {
  return {
    id: r.id as number, slug: r.slug as string, locationSlug: r.location_slug as string, sport: r.sport as string, leagueType: r.league_type as string,
    name: r.name as string, status: (r.status as SiteProgram['status']) ?? 'coming_soon', statusLabel: (r.status_label as string) ?? null,
    description: (r.description as string) ?? null, facts: pairs(r.facts), programId: (r.program_id as number) ?? null, sortOrder: (r.sort_order as number) ?? 100,
  };
}

export async function listLocations(brandKey: string): Promise<SiteLocation[]> {
  const db = supabaseAdmin();
  const { data } = await db.from('site_locations').select(LCOLS).eq('brand_key', brandKey).order('sort_order').order('id');
  const locs = (data ?? []).map(toLoc);
  // Venue photos (0076) and program leadership (0077) are columns added
  // later; `*` reads whichever exist, so the site renders before either
  // migration runs.
  const { data: extra } = await db.from('site_locations').select('*').eq('brand_key', brandKey);
  if (extra) for (const l of locs) {
    const row = extra.find((x) => x.slug === l.slug) as Record<string, unknown> | undefined;
    if (!row) continue;
    if (Array.isArray(row.photos)) l.photos = row.photos as SiteLocation['photos'];
    if (Array.isArray(row.leaders)) l.leaders = row.leaders as SiteLeader[];
  }
  return locs;
}
export async function getLocation(brandKey: string, slug: string): Promise<SiteLocation | null> {
  return (await listLocations(brandKey)).find((l) => l.slug === slug) ?? null;
}
export async function listPrograms(brandKey: string, filter: { locationSlug?: string; sport?: string; includeArchived?: boolean } = {}): Promise<SiteProgram[]> {
  let q = supabaseAdmin().from('site_programs').select(PCOLS).eq('brand_key', brandKey).order('sort_order').order('id');
  if (filter.locationSlug) q = q.eq('location_slug', filter.locationSlug);
  if (filter.sport) q = q.eq('sport', filter.sport);
  if (!filter.includeArchived) q = q.neq('status', 'archived');
  const { data } = await q;
  return (data ?? []).map(toProg);
}
export async function getProgram(brandKey: string, slug: string): Promise<SiteProgram | null> {
  const { data } = await supabaseAdmin().from('site_programs').select(PCOLS).eq('brand_key', brandKey).eq('slug', slug).maybeSingle();
  return data ? toProg(data) : null;
}

/** Status pill text: the launch label beats the generic status. */
export function locationStatusLabel(l: Pick<SiteLocation, 'status' | 'launchLabel'>): { label: string; live: boolean } {
  if (l.launchLabel) return { label: l.launchLabel, live: false };
  return { open: { label: 'Open', live: true }, opening_soon: { label: 'Opening soon', live: false }, waitlist: { label: 'Waitlist', live: false }, closed: { label: 'Closed', live: false } }[l.status];
}
export function programStatusLabel(p: Pick<SiteProgram, 'status' | 'statusLabel'>): { label: string; live: boolean } {
  if (p.statusLabel) return { label: p.statusLabel, live: p.status === 'open' };
  return { open: { label: 'Open', live: true }, coming_soon: { label: 'Coming soon', live: false }, full: { label: 'Full', live: false }, closed: { label: 'Closed', live: false }, archived: { label: 'Archived', live: false } }[p.status];
}

// --- admin writes -------------------------------------------------------------

export async function saveLocation(brandKey: string, input: Partial<SiteLocation> & { name: string }, actorClerkId: string): Promise<SiteLocation> {
  const db = supabaseAdmin();
  const row: Record<string, unknown> = {
    brand_key: brandKey, name: input.name.trim(), city: input.city ?? null, region: input.region ?? 'Ontario', venue: input.venue ?? null, address: input.address ?? null,
    parking: input.parking ?? null, arrival: input.arrival ?? null, contact: input.contact ?? null, social_url: input.socialUrl ?? null, status: input.status ?? 'opening_soon',
    launch_label: input.launchLabel ?? null, sports: input.sports ?? [], note: input.note ?? null, photo_url: input.photoUrl ?? null, photo_alt: input.photoAlt ?? null,
    calendar: input.calendar ?? [], sort_order: input.sortOrder ?? 100,
  };
  let data;
  if (input.id) {
    const res = await db.from('site_locations').update(row).eq('brand_key', brandKey).eq('id', input.id).select(LCOLS).single();
    if (res.error) throw new Error(res.error.message);
    data = res.data;
  } else {
    row.slug = slugify(input.slug || input.name);
    const res = await db.from('site_locations').insert(row).select(LCOLS).single();
    if (res.error) throw new Error(res.error.message);
    data = res.data;
    // A location page so SEO, menus and the finder all have an address.
    await db.from('site_pages').insert({ brand_key: brandKey, kind: 'system', template: 'location', ref: data.slug, slug: data.slug, title: data.name, blocks_draft: [], blocks_published: [], published_at: new Date().toISOString(), published_by: actorClerkId, sort_order: 50 });
    for (const sport of (input.sports ?? [])) {
      await db.from('site_pages').insert({ brand_key: brandKey, kind: 'system', template: 'location-sport', ref: `${data.slug}/${sport}`, slug: `${data.slug}/${sport}`, title: `${data.name} · ${sportBySlug(sport)?.name ?? sport}`, blocks_draft: [], blocks_published: [], published_at: new Date().toISOString(), published_by: actorClerkId, sort_order: 51 });
    }
  }
  // Leaders column arrives in 0077; a failed write before then is ignored.
  if (input.leaders !== undefined) await db.from('site_locations').update({ leaders: input.leaders }).eq('brand_key', brandKey).eq('id', data.id).then(() => undefined, () => undefined);
  await audit({ actorId: actorClerkId, action: 'site.location', target: `site:${brandKey}`, meta: { id: data.id, name: data.name } });
  return toLoc(data);
}

export async function saveProgram(brandKey: string, input: Partial<SiteProgram> & { name: string; locationSlug: string; sport: string; leagueType: string }, actorClerkId: string): Promise<SiteProgram> {
  const db = supabaseAdmin();
  const row: Record<string, unknown> = {
    brand_key: brandKey, name: input.name.trim(), location_slug: input.locationSlug, sport: input.sport, league_type: input.leagueType, status: input.status ?? 'coming_soon',
    status_label: input.statusLabel ?? null, description: input.description ?? null, facts: input.facts ?? [], program_id: input.programId ?? null, sort_order: input.sortOrder ?? 100,
  };
  let data;
  if (input.id) {
    const res = await db.from('site_programs').update(row).eq('brand_key', brandKey).eq('id', input.id).select(PCOLS).single();
    if (res.error) throw new Error(res.error.message);
    data = res.data;
  } else {
    row.slug = slugify(input.slug || `${input.locationSlug}-${input.name}`);
    const res = await db.from('site_programs').insert(row).select(PCOLS).single();
    if (res.error) throw new Error(res.error.message);
    data = res.data;
  }
  await audit({ actorId: actorClerkId, action: 'site.program', target: `site:${brandKey}`, meta: { id: data.id, name: data.name } });
  return toProg(data);
}

export async function deleteProgram(brandKey: string, id: number, actorClerkId: string): Promise<void> {
  await supabaseAdmin().from('site_programs').update({ status: 'archived' }).eq('brand_key', brandKey).eq('id', id);
  await audit({ actorId: actorClerkId, action: 'site.program', target: `site:${brandKey}`, meta: { archived: id } });
}
