import 'server-only';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import type { BrandSite } from '@/lib/site/sites';
import type { SitePage } from '@/lib/site/pages';
import { listPages } from '@/lib/site/pages';
import { listLocations, listPrograms, sportBySlug, listProgramLines } from '@/lib/site/records';
import { publishedPosts } from '@/lib/site/posts';

/**
 * SEO tool (ALL CAN §6.5, Module 23 §9): per-page titles and descriptions
 * with formats, suggestions, the auto-ticked checklist, redirects, sitemap
 * and robots.txt. Pure checks over records; nothing here calls Google.
 */

import { TITLE_MAX, DESC_MIN, DESC_MAX } from './constants';
export { TITLE_MAX, DESC_MIN, DESC_MAX };

export function fillTitleFormat(site: BrandSite, page: Pick<SitePage, 'template' | 'title' | 'ref'>): string {
  const f = site.seo.title_formats ?? {};
  const name = site.name;
  if (page.template === 'location') return (f.location ?? `{Location} · ${name}`).replace('{Location}', page.title);
  if (page.template === 'location-sport') {
    const [loc, sport] = page.title.split(' · ');
    return (f.sport ?? `{Sport} in {Location} · ${name}`).replace('{Sport}', sport ?? page.title).replace('{Location}', loc ?? '');
  }
  if (page.template === 'home') return (f.page ?? `{Page} · ${name}`).replace('{Page}', name).replace(`${name} · ${name}`, name);
  return (f.page ?? `{Page} · ${name}`).replace('{Page}', page.title);
}

export const pageTitle = (site: BrandSite, page: SitePage) => page.seo.title?.trim() || fillTitleFormat(site, page);
export const pageDescription = (site: BrandSite, page: SitePage) => page.seo.description?.trim() || site.seo.default_description || '';

export interface SeoIssue { key: 'title' | 'desc' | 'noindex' | 'alt'; message: string }

export function keywordHit(site: BrandSite, title: string, desc: string): string | null | '' {
  const kws = site.seo.keywords ?? [];
  if (!kws.length) return null;
  const h = `${title} ${desc}`.toLowerCase();
  return kws.find((k) => k.toLowerCase().split(/\s+/).filter((w) => w.length > 3).every((w) => h.includes(w))) ?? '';
}

function imagesWithoutAlt(page: SitePage): number {
  const blocks = page.blocksPublished ?? page.blocksDraft;
  let n = 0;
  for (const m of JSON.stringify(blocks).matchAll(/"(imageUrl|coverUrl)":"([^"]+)","(imageAlt|alt|coverAlt)":""/g)) if (m[2]) n += 1;
  return n;
}

export function pageIssues(site: BrandSite, page: SitePage, all: SitePage[]): SeoIssue[] {
  const out: SeoIssue[] = [];
  if (page.state === 'draft' || page.seo.noindex) return out;
  const t = pageTitle(site, page);
  const d = page.seo.description?.trim() ?? '';
  if (t.length > TITLE_MAX) out.push({ key: 'title', message: `Search title is ${t.length} characters. Google shows about ${TITLE_MAX}.` });
  if (all.some((x) => x.id !== page.id && x.state !== 'draft' && !x.seo.noindex && pageTitle(site, x) === t)) out.push({ key: 'title', message: 'Another page has the same search title.' });
  if (!d) out.push({ key: 'desc', message: 'No description. Google will pick text from the page instead.' });
  else if (d.length < DESC_MIN) out.push({ key: 'desc', message: `Description is short (${d.length} characters). Aim for 120 to 160.` });
  else if (d.length > DESC_MAX) out.push({ key: 'desc', message: `Description is ${d.length} characters. Google cuts it off after about ${DESC_MAX}.` });
  if (page.hiddenFromMenu && page.kind === 'custom') out.push({ key: 'noindex', message: 'Hidden from the menu but still in search results.' });
  const alt = imagesWithoutAlt(page);
  if (alt) out.push({ key: 'alt', message: `${alt} image${alt > 1 ? 's have' : ' has'} no alt text.` });
  return out;
}

export interface ChecklistItem { group: string; label: string; done: boolean; action: string }

export async function seoChecklist(site: BrandSite): Promise<ChecklistItem[]> {
  const pages = await listPages(site.brandKey);
  const live = pages.filter((p) => p.state !== 'draft' && !p.seo.noindex);
  const home = pages.find((p) => p.slug === '');
  const hi = home ? pageIssues(site, home, pages) : [];
  const firstWith = (k: SeoIssue['key']) => live.find((p) => pageIssues(site, p, pages).some((i) => i.key === k));
  const gsc = !!site.seo.gsc?.verified_at;
  const locPages = pages.filter((p) => p.template === 'location');
  const { data: redirects } = await supabaseAdmin().from('site_redirects').select('to_path').eq('brand_key', site.brandKey);
  return [
    { group: 'Get set up', label: 'Tell us about the site and pick keywords', done: !!site.seo.setup_done, action: 'wizard' },
    { group: 'Get set up', label: 'Connect Google Search Console', done: gsc, action: 'gsc' },
    { group: 'Get set up', label: 'Submit your sitemap to Google', done: !!site.seo.gsc?.sitemap_submitted_at, action: 'gsc' },
    { group: 'Home page', label: `Search title under ${TITLE_MAX} characters`, done: !hi.some((i) => i.key === 'title'), action: home ? `page:${home.id}` : 'wizard' },
    { group: 'Home page', label: 'Description of 120 to 160 characters', done: !hi.some((i) => i.key === 'desc'), action: home ? `page:${home.id}` : 'wizard' },
    { group: 'Home page', label: 'Uses one of your keywords', done: !!(home && keywordHit(site, pageTitle(site, home), pageDescription(site, home))), action: site.seo.keywords?.length && home ? `page:${home.id}` : 'wizard' },
    { group: 'Every page', label: 'Location pages have their own title and description', done: locPages.length > 0 && locPages.every((p) => !!p.seo.title && !pageIssues(site, p, pages).some((i) => i.key === 'desc' || i.key === 'title')), action: locPages.find((p) => !p.seo.title || pageIssues(site, p, pages).length) ? `page:${locPages.find((p) => !p.seo.title || pageIssues(site, p, pages).length)!.id}` : 'none' },
    { group: 'Every page', label: 'Every page has a description', done: !firstWith('desc'), action: firstWith('desc') ? `page:${firstWith('desc')!.id}` : 'none' },
    { group: 'Every page', label: 'Every image has alt text', done: !firstWith('alt'), action: 'alt' },
    { group: 'Every page', label: 'Pages hidden from the menu are hidden from search', done: !firstWith('noindex'), action: firstWith('noindex') ? `page:${firstWith('noindex')!.id}` : 'none' },
    { group: 'Every page', label: 'Old addresses redirect to new pages', done: (redirects ?? []).every((r) => !!r.to_path), action: 'redirects' },
    { group: 'Optional', label: 'Link a Google Business Profile', done: !!(site.seo.gbp_location_slugs?.length), action: 'gbp' },
  ];
}

export async function savePageSeo(brandKey: string, pageId: number, seo: { title?: string; description?: string; noindex?: boolean }, actorClerkId: string): Promise<void> {
  const { updatePageMeta } = await import('@/lib/site/pages');
  await updatePageMeta(brandKey, pageId, { seo: { title: seo.title?.trim() || undefined, description: seo.description?.trim() || undefined, noindex: !!seo.noindex } }, actorClerkId);
}

// --- redirects ---------------------------------------------------------------

export interface Redirect { id: number; fromPath: string; toPath: string | null; reason: string | null }

export async function listRedirects(brandKey: string): Promise<Redirect[]> {
  const { data } = await supabaseAdmin().from('site_redirects').select('id, from_path, to_path, reason').eq('brand_key', brandKey).order('id');
  return (data ?? []).map((r) => ({ id: r.id, fromPath: r.from_path, toPath: r.to_path, reason: r.reason }));
}

const normPath = (p: string) => { let v = p.trim(); if (!v.startsWith('/') && !/^https?:\/\//.test(v)) v = `/${v}`; return v.replace(/\/+$/, '') || '/'; };

/** Add (or update) a redirect; repoints any redirect that targeted `from` so there are no chains. */
export async function addRedirect(brandKey: string, from: string, to: string | null, reason: string, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const f = normPath(from);
  const t = to ? normPath(to) : null;
  if (t && t === f) throw new Error('A redirect can\'t point at itself.');
  const { error } = await db.from('site_redirects').upsert({ brand_key: brandKey, from_path: f, to_path: t, reason, created_by: actorClerkId }, { onConflict: 'brand_key,from_path' });
  if (error) throw new Error(error.message);
  if (t) await db.from('site_redirects').update({ to_path: t }).eq('brand_key', brandKey).eq('to_path', f);
  const { publishHostsManifest } = await import('@/lib/site/sites');
  await publishHostsManifest();
  await audit({ actorId: actorClerkId, action: 'site.redirect', target: `site:${brandKey}`, meta: { from: f, to: t } });
}

export async function setRedirectTarget(brandKey: string, id: number, to: string | null, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data } = await db.from('site_redirects').select('from_path').eq('brand_key', brandKey).eq('id', id).maybeSingle();
  if (!data) return;
  await addRedirect(brandKey, data.from_path, to, 'Set by an editor', actorClerkId);
}

export async function deleteRedirect(brandKey: string, id: number, actorClerkId: string): Promise<void> {
  await supabaseAdmin().from('site_redirects').delete().eq('brand_key', brandKey).eq('id', id);
  const { publishHostsManifest } = await import('@/lib/site/sites');
  await publishHostsManifest();
  await audit({ actorId: actorClerkId, action: 'site.redirect', target: `site:${brandKey}`, meta: { deleted: id } });
}

// --- sitemap + robots --------------------------------------------------------

export async function sitemapEntries(site: BrandSite, origin: string): Promise<{ loc: string; lastmod?: string }[]> {
  if (site.status !== 'live') return [];
  const [pages, locs, posts] = await Promise.all([listPages(site.brandKey), listLocations(site.brandKey), publishedPosts(site.brandKey)]);
  const out: { loc: string; lastmod?: string }[] = [];
  for (const p of pages) {
    if (p.state === 'draft' || p.seo.noindex || p.template === 'my-teams') continue;
    out.push({ loc: `${origin}/${p.slug}`.replace(/\/$/, '') || origin, lastmod: p.publishedAt ?? undefined });
  }
  const have = new Set(out.map((o) => o.loc));
  for (const l of locs) {
    const u = `${origin}/${l.slug}`;
    if (!have.has(u)) out.push({ loc: u });
    for (const s of l.sports) { const su = `${origin}/${l.slug}/${s}`; if (!have.has(su)) out.push({ loc: su }); }
  }
  for (const l of await listProgramLines(site.brandKey)) { const u = `${origin}${l.path}`; if (!have.has(u) && !out.some((o) => o.loc === u)) out.push({ loc: u }); }
  for (const p of posts) out.push({ loc: `${origin}/stories/${p.slug}`, lastmod: p.publishedAt ?? undefined });
  return out;
}

export function robotsTxt(site: BrandSite, origin: string): string {
  const ai = site.seo.ai ?? { answers: true, training: false };
  const lines = ['User-agent: *'];
  if (site.status !== 'live') lines.push('Disallow: /');
  else lines.push('Disallow: /api/', 'Disallow: /preview/', 'Disallow: /my-teams');
  if (site.status === 'live' && ai.answers === false) lines.push('', 'User-agent: OAI-SearchBot', 'User-agent: PerplexityBot', 'User-agent: Claude-SearchBot', 'Disallow: /');
  if (site.status === 'live' && ai.training !== true) lines.push('', 'User-agent: GPTBot', 'User-agent: ClaudeBot', 'User-agent: Google-Extended', 'User-agent: CCBot', 'Disallow: /');
  if (site.status === 'live') lines.push('', `Sitemap: ${origin}/sitemap.xml`);
  return lines.join('\n') + '\n';
}

// --- structured data ---------------------------------------------------------

export async function organizationJsonLd(site: BrandSite, origin: string): Promise<Record<string, unknown>> {
  const locs = await listLocations(site.brandKey);
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsOrganization',
    name: site.name,
    url: origin,
    parentOrganization: site.contact.legal_name ? { '@type': 'Organization', name: site.contact.legal_name } : undefined,
    email: site.contact.email,
    telephone: site.contact.phone,
    location: locs.map((l) => ({ '@type': 'SportsActivityLocation', name: l.venue ?? l.name, address: l.address ?? undefined, url: `${origin}/${l.slug}` })),
  };
}

export function breadcrumbJsonLd(origin: string, crumbs: [string, string][]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: crumbs.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${origin}${path}` })),
  };
}

/** Keyword suggestions from records (Claude polishes these when configured). */
export async function keywordSuggestions(site: BrandSite): Promise<string[]> {
  const [locs, progs] = await Promise.all([listLocations(site.brandKey), listPrograms(site.brandKey)]);
  const out = new Set<string>();
  for (const l of locs) {
    const city = (l.city ?? l.name).split(' ')[0];
    for (const s of l.sports) { const sp = sportBySlug(s)?.name.toLowerCase() ?? s; out.add(`youth ${sp} ${city}`); out.add(`${sp} league ${city}`); out.add(`kids ${sp} ${city}`); }
  }
  for (const p of progs) if (p.leagueType === 'Rep') out.add(`rep ${p.sport} ${locs[0]?.region ?? 'Ontario'}`);
  out.add(`adult rec league ${locs[0]?.city?.split(' ')[0] ?? 'Toronto'}`);
  return [...out].slice(0, 6);
}
