/**
 * Host -> app resolution for the portal.
 *
 * The portal serves FOUR kinds of host from one codebase:
 *   - play.athleteinstitute.ca     public-facing (customers, orgs, tenants, staff-as-customers)
 *   - admin.athleteinstitute.ca    staff-only backend (hard-gated via Module 1 roles)
 *   - compete.athleteinstitute.ca  the public competitive portal (standings, schedules, rosters)
 *   - brand sites (Module 23)      each brand's own root domain, e.g. allcansport.ca,
 *                                  served from app/site/[brand]
 *
 * apps.athleteinstitute.ca (the cross-app hub) already exists in the
 * athlete-institute-live repo and is NOT served here.
 *
 * Edge-safe: pure functions only, importable from middleware. The live site
 * host map comes from a manifest in the public brand-assets bucket
 * (sites/hosts.json, see lib/site/hosts-manifest.ts); SEEDED_SITE_HOSTS is the
 * code fallback so a storage outage never un-routes a live site.
 */

export type PortalApp = 'play' | 'admin' | 'compete' | 'site';

export const PORTAL_HOSTS: Record<Exclude<PortalApp, 'site'>, string> = {
  play: 'play.athleteinstitute.ca',
  admin: 'admin.athleteinstitute.ca',
  compete: 'compete.athleteinstitute.ca',
};

/** Cross-app links surfaced in the portal chrome (Module 0 §2). */
export const ECOSYSTEM_LINKS = {
  hub: 'https://apps.athleteinstitute.ca',
  live: 'https://live.athleteinstitute.ca',
  tickets: 'https://tickets.athleteinstitute.ca',
  gear: 'https://gear.athleteinstitute.ca',
} as const;

export interface ResolvedHost {
  app: PortalApp;
  /** Set when app === 'site'. */
  brandKey?: string;
  /** True when the host is a `www.` alias that should redirect to the apex. */
  wwwAlias?: boolean;
}

/** hostname (lowercase, no port) -> brand key. Code fallback for the manifest. */
export const SEEDED_SITE_HOSTS: Record<string, string> = {
  'allcansport.ca': 'all-can',
  'www.allcansport.ca': 'all-can',
};

export type SiteHostMap = Record<string, string>;

function bareHost(host: string | null | undefined): string {
  return (host ?? '').toLowerCase().split(':')[0];
}

/**
 * Resolve a request host. `siteHosts` is the live manifest (hostname -> brand
 * key) when the caller has one; the seeded map is always consulted as well.
 *
 * Local dev: admin.localhost / play.localhost / compete.localhost, and
 * `<brand>.site.localhost` for a brand site (e.g. all-can.site.localhost:3000).
 * Vercel previews can force a brand with ?site=<brand-key> (handled by the
 * caller, which passes it as `forcedBrand`).
 */
export function resolveHost(
  host: string | null | undefined,
  opts: { siteHosts?: SiteHostMap | null; forcedBrand?: string | null } = {},
): ResolvedHost {
  let h = bareHost(host);
  // Staging domains mirror prod hosts behind a `staging.` prefix
  // (staging.admin.athleteinstitute.ca etc., pinned to the staging branch).
  if (h.startsWith('staging.')) h = h.slice('staging.'.length);
  if (h === 'admin.athleteinstitute.ca' || h === 'admin.localhost' || h.startsWith('admin.')) return { app: 'admin' };
  if (h === 'compete.athleteinstitute.ca' || h === 'compete.localhost' || h.startsWith('compete.')) return { app: 'compete' };
  if (h === 'play.athleteinstitute.ca' || h === 'play.localhost' || h.startsWith('play.')) return { app: 'play' };

  const dev = h.match(/^([a-z0-9-]+)\.site\.localhost$/);
  if (dev) return { app: 'site', brandKey: dev[1] };

  const brand = opts.siteHosts?.[h] ?? SEEDED_SITE_HOSTS[h];
  if (brand) return { app: 'site', brandKey: brand, wwwAlias: h.startsWith('www.') };

  if (opts.forcedBrand && /^[a-z0-9-]+$/.test(opts.forcedBrand) && (h === 'localhost' || h.endsWith('.vercel.app') || h.endsWith('.localhost'))) {
    return { app: 'site', brandKey: opts.forcedBrand };
  }
  return { app: 'play' };
}

/**
 * Backwards-compatible shape: the app only. Brand sites resolve to 'site'.
 * Local dev: use admin.localhost:3000 / play.localhost:3000 (Chromium and
 * macOS resolve *.localhost to 127.0.0.1); bare localhost and unknown hosts
 * (e.g. *.vercel.app previews) default to play.
 */
export function resolvePortalApp(host: string | null | undefined): PortalApp {
  return resolveHost(host).app;
}

/** Canonical public origin for a brand site host (apex, https). */
export function siteOriginFor(primaryHost: string | null | undefined, fallback: string): string {
  if (!primaryHost) return fallback;
  const h = bareHost(primaryHost);
  if (h.endsWith('.localhost') || h === 'localhost') return `http://${primaryHost}`;
  return `https://${h}`;
}
