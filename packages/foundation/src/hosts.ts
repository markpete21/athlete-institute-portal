/**
 * Subdomain → app resolution for the portal.
 *
 * The portal serves TWO hostnames from one codebase (Module 0 spec):
 *   - play.athleteinstitute.ca  — public-facing (customers, orgs, tenants, staff-as-customers)
 *   - admin.athleteinstitute.ca — staff-only backend (hard-gated via Module 1 roles)
 *
 * apps.athleteinstitute.ca (the cross-app hub) already exists in the
 * athlete-institute-live repo and is NOT served here — the portal links to it
 * and registers its tiles in that hub's registry instead (see README).
 *
 * Edge-safe: pure functions only, importable from middleware.
 */

export type PortalApp = 'play' | 'admin';

export const PORTAL_HOSTS: Record<PortalApp, string> = {
  play: 'play.athleteinstitute.ca',
  admin: 'admin.athleteinstitute.ca',
};

/** Cross-app links surfaced in the portal chrome (Module 0 §2). */
export const ECOSYSTEM_LINKS = {
  hub: 'https://apps.athleteinstitute.ca',
  live: 'https://live.athleteinstitute.ca',
  tickets: 'https://tickets.athleteinstitute.ca',
} as const;

/**
 * Resolve which portal app a request host serves.
 * Local dev: use admin.localhost:3000 / play.localhost:3000
 * (Chromium and macOS resolve *.localhost to 127.0.0.1); bare
 * localhost and unknown hosts (e.g. *.vercel.app previews) default to play.
 */
export function resolvePortalApp(host: string | null | undefined): PortalApp {
  const h = (host ?? '').toLowerCase().split(':')[0];
  if (h === 'admin.athleteinstitute.ca' || h === 'admin.localhost' || h.startsWith('admin.')) {
    return 'admin';
  }
  return 'play';
}
