import 'server-only';
import { headers } from 'next/headers';
import { resolveTheme, themeCssVars, type ThemePack } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { getSite, siteOrigin, type BrandSite } from '@/lib/site/sites';
import { publicNav, type NavItem } from '@/lib/site/nav';
import { verifyPreviewToken } from '@/lib/site/preview';

/**
 * Per-request site context for app/site/[brand]: the site row, its theme,
 * the public menu, and whether this request is a staff preview (draft
 * blocks, launch switch ignored). Everything public reads from here.
 */

export interface SiteContext {
  site: BrandSite;
  theme: ThemePack;
  themeVars: Record<string, string>;
  nav: NavItem[];
  origin: string;
  host: string;
  preview: boolean;
  previewToken: string | null;
  /** True when this host is a Clerk satellite, so a session (account chip, My teams, Follow) can exist here. */
  accountOnHost: boolean;
}

export async function siteContext(brandKey: string, previewToken?: string | null): Promise<SiteContext | null> {
  const site = await getSite(brandKey);
  if (!site) return null;
  const h = headers();
  const host = h.get('x-site-host') ?? h.get('host') ?? '';
  const { data: brand } = await supabaseAdmin().from('brands').select('design_tokens, accent').eq('key', brandKey).maybeSingle();
  const theme = resolveTheme(site.themeKey, { ...((brand?.design_tokens as Record<string, unknown>) ?? {}), ...(site.themeKey === 'vanguard' && brand?.accent ? { accent: brand.accent } : {}) });
  const token = previewToken ?? null;
  const preview = token ? verifyPreviewToken(token, brandKey).ok : false;
  const nav = await publicNav(brandKey);
  const origin = siteOrigin(site, host);
  const bare = host.toLowerCase().replace(/:\d+$/, '');
  const envSats = (process.env.CLERK_SATELLITE_HOSTS ?? '').split(/[,\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const accountOnHost = site.settings.clerk_satellite === true || envSats.includes(bare) || bare.endsWith('.localhost') || bare === 'localhost';
  return { site, theme, themeVars: themeCssVars(theme), nav, origin, host, preview, previewToken: preview ? token : null, accountOnHost };
}

/** Add the preview token to a site-relative link when previewing. */
export function withPreview(ctx: Pick<SiteContext, 'previewToken'>, href: string): string {
  if (!ctx.previewToken || !href.startsWith('/')) return href;
  return `${href}${href.includes('?') ? '&' : '?'}preview=${encodeURIComponent(ctx.previewToken)}`;
}

/** Date helpers in the brand copy format. */
export const TZ = 'America/Toronto';
export function fmtDateStacked(iso: string | null): [string, string, string] {
  if (!iso) return ['TBD', '', ''];
  const d = new Date(iso);
  const wd = d.toLocaleDateString('en-CA', { timeZone: TZ, weekday: 'long' });
  const md = d.toLocaleDateString('en-CA', { timeZone: TZ, month: 'long', day: 'numeric' });
  const yr = d.toLocaleDateString('en-CA', { timeZone: TZ, year: 'numeric' });
  const day = Number(md.split(' ').pop());
  const sfx = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
  return [wd, `${md}${sfx}`, `${yr}.`];
}
export function fmtTime(iso: string | null): string {
  if (!iso) return 'TBD';
  return new Date(iso).toLocaleTimeString('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).replace(/\s?([ap])\.?m\.?/i, '$1m').toLowerCase() + ' ET';
}
export function fmtDay(iso: string | null): string {
  if (!iso) return 'TBD';
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });
}
