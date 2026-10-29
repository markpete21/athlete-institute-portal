import 'server-only';
import { audit, setBrandSiteUrls, siteOriginFor } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { BUCKETS, uploadFile } from '@ai/foundation/storage';

/**
 * Brand sites (Module 23 §2.1): one row per brand with a website. Everything
 * public reads through `getSite(brandKey)`; admin writes go through the
 * functions below, each audited.
 */

export type SiteStatus = 'off' | 'coming_soon' | 'live';

export interface SiteSeo {
  title?: string;
  default_description?: string;
  og_image_url?: string;
  keywords?: string[];
  business?: { name?: string; offer?: string; location_slugs?: string[] };
  title_formats?: { page?: string; location?: string; sport?: string; team?: string };
  gsc?: { verified_at?: string | null; sitemap_submitted_at?: string | null; property?: string };
  gbp_location_slugs?: string[];
  index_team_pages?: boolean;
  ai?: { answers?: boolean; training?: boolean };
  setup_done?: boolean;
}

export interface FooterColumn { title: string; items: { label: string; href: string; new_tab?: boolean }[] }

export interface BrandSite {
  brandKey: string;
  status: SiteStatus;
  hostnames: string[];
  primaryHost: string | null;
  themeKey: string;
  name: string;
  seo: SiteSeo;
  social: Record<string, string>;
  contact: { email?: string; phone?: string; address?: string; legal_name?: string; map_url?: string };
  links: { watch_url?: string; tickets_url?: string; gear_url?: string; play_url?: string };
  comingSoon: { headline?: string; body?: string; show_email_capture?: boolean };
  footer: { columns?: FooterColumn[]; tagline?: string; legal_text?: string; partners?: boolean };
  analytics: Record<string, unknown>;
  settings: { ask_enabled?: boolean; ask_handoff_email?: string; ask_handoff_phone?: string };
  homePageId: number | null;
  launchedAt: string | null;
  updatedAt: string;
}

const COLS = 'brand_key, status, hostnames, primary_host, theme_key, name, seo, social, contact, links, coming_soon, footer, analytics, settings, home_page_id, launched_at, updated_at';

function toSite(r: Record<string, unknown>): BrandSite {
  const j = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, never>) : {});
  return {
    brandKey: r.brand_key as string,
    status: (r.status as SiteStatus) ?? 'off',
    hostnames: (r.hostnames as string[]) ?? [],
    primaryHost: (r.primary_host as string) ?? null,
    themeKey: (r.theme_key as string) ?? 'vanguard',
    name: (r.name as string) ?? (r.brand_key as string),
    seo: j(r.seo), social: j(r.social), contact: j(r.contact), links: j(r.links), comingSoon: j(r.coming_soon),
    footer: j(r.footer), analytics: j(r.analytics), settings: j(r.settings),
    homePageId: (r.home_page_id as number) ?? null,
    launchedAt: (r.launched_at as string) ?? null,
    updatedAt: r.updated_at as string,
  };
}

export async function getSite(brandKey: string): Promise<BrandSite | null> {
  const { data } = await supabaseAdmin().from('brand_sites').select(COLS).eq('brand_key', brandKey).maybeSingle();
  return data ? toSite(data) : null;
}

export async function listSites(): Promise<BrandSite[]> {
  const { data } = await supabaseAdmin().from('brand_sites').select(COLS).order('brand_key');
  return (data ?? []).map(toSite);
}

/** Brands with no site yet (for the create-site flow). */
export async function brandsWithoutSite(): Promise<{ key: string; name: string }[]> {
  const db = supabaseAdmin();
  const [{ data: brands }, { data: sites }] = await Promise.all([
    db.from('brands').select('key, name').order('key'),
    db.from('brand_sites').select('brand_key'),
  ]);
  const have = new Set((sites ?? []).map((s) => s.brand_key));
  return (brands ?? []).filter((b) => !have.has(b.key)).map((b) => ({ key: b.key, name: b.name ?? b.key }));
}

/** Public origin for a site (https://apex, or the dev host). */
export function siteOrigin(site: BrandSite, fallbackHost?: string | null): string {
  const host = site.primaryHost ?? site.hostnames[0] ?? fallbackHost ?? `${site.brandKey}.site.localhost:3000`;
  return siteOriginFor(host, `https://${host}`);
}

/**
 * Publish the edge manifest (hosts, redirects, satellites) to the public
 * bucket. Middleware reads it with a one-minute cache; the code seed covers
 * the first site if the bucket is ever unreachable.
 */
export async function publishHostsManifest(): Promise<void> {
  const db = supabaseAdmin();
  const [{ data: sites }, { data: redirects }] = await Promise.all([
    db.from('brand_sites').select('brand_key, status, hostnames'),
    db.from('site_redirects').select('brand_key, from_path, to_path'),
  ]);
  const hosts: Record<string, string> = {};
  const satellites: string[] = [];
  for (const s of sites ?? []) {
    for (const h of (s.hostnames as string[]) ?? []) {
      hosts[h.toLowerCase()] = s.brand_key;
      if (s.status !== 'off' && !h.startsWith('www.')) satellites.push(h.toLowerCase());
    }
  }
  const rmap: Record<string, Record<string, string>> = {};
  for (const r of redirects ?? []) {
    if (!r.to_path) continue;
    (rmap[r.brand_key] = rmap[r.brand_key] ?? {})[r.from_path] = r.to_path;
  }
  const body = JSON.stringify({ hosts, redirects: rmap, satellites, updatedAt: new Date().toISOString() });
  try {
    await uploadFile(BUCKETS.brandAssets, 'sites/hosts.json', new Blob([body], { type: 'application/json' }), { contentType: 'application/json', upsert: true });
  } catch (err) {
    console.warn('[sites] hosts manifest publish failed:', err instanceof Error ? err.message : err);
  }
}

/** Load brands.site_url into the edge-safe brandSiteUrl() map. Cheap; call per request where links are built. */
export async function loadBrandSiteUrls(): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin().from('brands').select('key, site_url').not('site_url', 'is', null);
  const map: Record<string, string> = {};
  for (const b of data ?? []) if (b.site_url) map[b.key] = b.site_url;
  setBrandSiteUrls(map);
  return map;
}

export async function createSite(input: { brandKey: string; name: string; themeKey?: string; actorClerkId: string }): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from('brand_sites').insert({
    brand_key: input.brandKey, name: input.name, theme_key: input.themeKey ?? 'vanguard', status: 'off', created_by: input.actorClerkId,
    seo: { title: input.name, default_description: '', title_formats: { page: `{Page} · ${input.name}`, location: `{Location} · ${input.name}`, sport: `{Sport} in {Location} · ${input.name}`, team: `{Team} · {Division} · ${input.name}` }, ai: { answers: true, training: false }, index_team_pages: true },
    coming_soon: { headline: `${input.name} is coming.`, body: 'Leave your email and we will tell you when we launch.', show_email_capture: true },
    settings: { ask_enabled: false },
  });
  if (error) throw new Error(`site create failed: ${error.message}`);
  // System pages + a default menu so the site renders from minute one.
  const pages = [
    ['home', 'home', '', 'Home', 1], ['system', 'locations', 'locations', 'Locations', 2], ['system', 'scores', 'scores', 'Schedules and results', 3],
    ['system', 'standings', 'standings', 'Standings', 4], ['system', 'rosters', 'rosters', 'Rosters', 5], ['system', 'stories', 'stories', 'Stories', 6],
    ['system', 'about', 'about', `About ${input.name}`, 7], ['system', 'programs', 'programs', 'Programs', 8], ['system', 'privacy-policy', 'privacy-policy', 'Privacy policy', 9], ['system', 'my-teams', 'my-teams', 'My teams', 10],
  ] as const;
  const { data: inserted } = await db.from('site_pages').insert(pages.map(([kind, template, slug, title, sort]) => ({
    brand_key: input.brandKey, kind, template, slug, title, sort_order: sort, blocks_draft: template === 'home' ? [{ id: 'b-hero', type: 'hero', props: { style: 'ink', heading: `${input.name}.`, subheading: '', ctaLabel: 'Programs', ctaHref: '/programs', height: 'short' } }] : [],
    blocks_published: template === 'home' ? [{ id: 'b-hero', type: 'hero', props: { style: 'ink', heading: `${input.name}.`, subheading: '', ctaLabel: 'Programs', ctaHref: '/programs', height: 'short' } }] : [],
    published_at: new Date().toISOString(), published_by: input.actorClerkId, hidden_from_menu: ['privacy-policy', 'my-teams'].includes(slug),
  }))).select('id, slug');
  const byslug = new Map((inserted ?? []).map((p) => [p.slug, p.id]));
  await db.from('brand_sites').update({ home_page_id: byslug.get('') ?? null }).eq('brand_key', input.brandKey);
  const nav = [['Programs', 'programs'], ['Standings', 'standings'], ['Schedule', 'scores'], ['Stories', 'stories'], ['About', 'about']] as const;
  await db.from('site_nav_items').insert(nav.map(([label, slug], i) => ({ brand_key: input.brandKey, kind: 'page', label, page_id: byslug.get(slug) ?? null, href: `/${slug}`, sort_order: i + 1 })));
  await db.from('brand_sites').update({ footer: { columns: [{ title: input.name, items: nav.map(([label, slug]) => ({ label, href: `/${slug}` })) }, { title: 'Athlete Institute', items: [{ label: 'Watch', href: 'https://live.athleteinstitute.ca', new_tab: true }, { label: 'Tickets', href: 'https://tickets.athleteinstitute.ca', new_tab: true }, { label: 'Shop', href: 'https://gear.athleteinstitute.ca', new_tab: true }] }] } }).eq('brand_key', input.brandKey);
  await audit({ actorId: input.actorClerkId, action: 'site.create', target: `site:${input.brandKey}` });
}

export interface LaunchCheck { ok: boolean; label: string; detail?: string }

/** Go-live checks (Module 23 §6.4) + the [TBC] sweep from the ALL CAN prompt. */
export async function launchChecks(brandKey: string): Promise<LaunchCheck[]> {
  const db = supabaseAdmin();
  const site = await getSite(brandKey);
  if (!site) return [{ ok: false, label: 'Site exists' }];
  const [{ data: home }, { count: navCount }, { data: pages }, { data: programs }] = await Promise.all([
    db.from('site_pages').select('blocks_published').eq('brand_key', brandKey).eq('slug', '').maybeSingle(),
    db.from('site_nav_items').select('id', { count: 'exact', head: true }).eq('brand_key', brandKey),
    db.from('site_pages').select('title, blocks_published').eq('brand_key', brandKey).not('blocks_published', 'is', null),
    db.from('site_programs').select('name, facts').eq('brand_key', brandKey).neq('status', 'archived'),
  ]);
  const tbc: string[] = [];
  for (const p of pages ?? []) if (JSON.stringify(p.blocks_published ?? []).includes('[TBC]')) tbc.push(p.title);
  for (const p of programs ?? []) if (JSON.stringify(p.facts ?? []).includes('[TBC]')) tbc.push(p.name);
  return [
    { ok: !!site.primaryHost, label: 'A primary domain is set', detail: site.primaryHost ?? 'Add a domain in Settings' },
    { ok: !!home?.blocks_published, label: 'The home page is published' },
    { ok: (navCount ?? 0) > 0, label: 'The menu is saved' },
    { ok: !!(site.footer.columns?.length), label: 'The footer is saved' },
    { ok: tbc.length === 0, label: 'No [TBC] left on published pages', detail: tbc.length ? `Still marked: ${[...new Set(tbc)].slice(0, 6).join(', ')}${tbc.length > 6 ? '…' : ''}` : undefined },
  ];
}

export async function setSiteStatus(brandKey: string, status: SiteStatus, actorClerkId: string): Promise<{ ok: boolean; blockers: string[] }> {
  const db = supabaseAdmin();
  if (status === 'live') {
    const checks = await launchChecks(brandKey);
    const blockers = checks.filter((c) => !c.ok && c.label !== 'No [TBC] left on published pages').map((c) => c.label);
    if (blockers.length) return { ok: false, blockers };
  }
  const site = await getSite(brandKey);
  if (!site) throw new Error('Site not found.');
  const patch: Record<string, unknown> = { status };
  if (status === 'live' && !site.launchedAt) patch.launched_at = new Date().toISOString();
  const { error } = await db.from('brand_sites').update(patch).eq('brand_key', brandKey);
  if (error) throw new Error(error.message);
  await db.from('brands').update({ site_url: status === 'live' ? siteOrigin(site) : null }).eq('key', brandKey);
  await publishHostsManifest();
  await audit({ actorId: actorClerkId, action: 'site.status', target: `site:${brandKey}`, meta: { status } });
  return { ok: true, blockers: [] };
}

export async function updateSiteSettings(brandKey: string, patch: Partial<{
  name: string; themeKey: string; hostnames: string[]; primaryHost: string | null;
  seo: SiteSeo; social: Record<string, string>; contact: BrandSite['contact']; links: BrandSite['links'];
  comingSoon: BrandSite['comingSoon']; footer: BrandSite['footer']; settings: BrandSite['settings'];
}>, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const current = await getSite(brandKey);
  if (!current) throw new Error('Site not found.');
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.themeKey !== undefined) row.theme_key = patch.themeKey;
  if (patch.hostnames !== undefined) row.hostnames = patch.hostnames.map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (patch.primaryHost !== undefined) row.primary_host = patch.primaryHost?.trim().toLowerCase() || null;
  if (patch.seo !== undefined) row.seo = { ...current.seo, ...patch.seo };
  if (patch.social !== undefined) row.social = patch.social;
  if (patch.contact !== undefined) row.contact = { ...current.contact, ...patch.contact };
  if (patch.links !== undefined) row.links = { ...current.links, ...patch.links };
  if (patch.comingSoon !== undefined) row.coming_soon = { ...current.comingSoon, ...patch.comingSoon };
  if (patch.footer !== undefined) row.footer = { ...current.footer, ...patch.footer };
  if (patch.settings !== undefined) row.settings = { ...current.settings, ...patch.settings };
  const { error } = await db.from('brand_sites').update(row).eq('brand_key', brandKey);
  if (error) throw new Error(error.message);
  if (patch.hostnames !== undefined || patch.primaryHost !== undefined) {
    if (current.status === 'live') await db.from('brands').update({ site_url: siteOrigin({ ...current, primaryHost: (row.primary_host as string) ?? current.primaryHost, hostnames: (row.hostnames as string[]) ?? current.hostnames }) }).eq('key', brandKey);
    await publishHostsManifest();
    await audit({ actorId: actorClerkId, action: 'site.domain', target: `site:${brandKey}`, meta: { hostnames: row.hostnames, primary: row.primary_host } });
  } else {
    await audit({ actorId: actorClerkId, action: 'site.settings', target: `site:${brandKey}`, meta: { keys: Object.keys(row) } });
  }
}

/**
 * DNS check for the Domains panel: resolves the apex and www through DNS over
 * HTTPS and says what each points at, with the GoDaddy records to add.
 */
export async function verifyDns(hostnames: string[]): Promise<{ host: string; records: string[]; ok: boolean; want: string }[]> {
  const out: { host: string; records: string[]; ok: boolean; want: string }[] = [];
  for (const host of hostnames) {
    const isWww = host.startsWith('www.');
    const want = isWww ? 'CNAME cname.vercel-dns.com' : 'A 76.76.21.21';
    const type = isWww ? 'CNAME' : 'A';
    let records: string[] = [];
    try {
      const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, { headers: { accept: 'application/dns-json' }, cache: 'no-store' });
      const json = (await res.json()) as { Answer?: { data: string }[] };
      records = (json.Answer ?? []).map((a) => a.data.replace(/\.$/, ''));
    } catch {
      records = [];
    }
    const ok = isWww ? records.some((r) => r.includes('vercel-dns.com')) : records.includes('76.76.21.21');
    out.push({ host, records, ok, want });
  }
  return out;
}
