/**
 * brandSiteUrl() (Module 23 §8.3) - the one place a link to a brand's own
 * website is built. Edge-safe: the map of brand -> live site origin is set by
 * server code (lib/site/sites.ts reads brands.site_url and calls
 * setBrandSiteUrls) and read here by notify() templates, TV displays and
 * Compete. Until a site goes live its entry is absent and callers fall back
 * to Play / Compete.
 */

const KEY = '__aiBrandSiteUrls';

function store(): Record<string, string> {
  const g = globalThis as Record<string, unknown>;
  if (!g[KEY]) g[KEY] = {};
  return g[KEY] as Record<string, string>;
}

/** Replace the whole map (server code, after reading brands.site_url). */
export function setBrandSiteUrls(map: Record<string, string>): void {
  const s = store();
  for (const k of Object.keys(s)) delete s[k];
  Object.assign(s, map);
}

/** Live site origin for a brand (no trailing slash), or null when it has none. */
export function brandSiteUrl(brandKey: string | null | undefined): string | null {
  if (!brandKey) return null;
  const v = store()[brandKey];
  return v ? v.replace(/\/+$/, '') : null;
}

/** A link on the brand site when it is live, else the fallback origin + path. */
export function brandLink(brandKey: string | null | undefined, path: string, fallbackOrigin: string): string {
  const base = brandSiteUrl(brandKey) ?? fallbackOrigin.replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
