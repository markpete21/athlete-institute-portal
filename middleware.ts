import { clerkMiddleware, type ClerkMiddlewareOptions } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';
import { resolveHost, SEEDED_SITE_HOSTS, type SiteHostMap } from '@ai/foundation';

/**
 * Host routing (Module 0 §1, Module 23 §1) + auth wiring (Module 0 §3), one middleware.
 *
 * The host decides which route tree serves the request: play.* → /play/*,
 * admin.* → /admin/*, compete.* → /compete/*, and any brand-site host
 * (allcansport.ca) → /site/<brand>/*. Direct path access to the wrong tree 404s
 * by construction (a play-host request for /admin/x becomes /play/admin/x,
 * which doesn't exist).
 *
 * Auth model (mirrors the live app): middleware only enforces a *signed-in
 * session* for the admin host — the staff ROLE check needs the full user record
 * and lives in the /admin layout guard (requireStaff). play.* is open.
 *
 * compete.* and every brand site are FULLY PUBLIC by design — standings,
 * schedules and rosters are readable with no session at all. Nothing below
 * gates them, and the data layers (lib/compete, lib/site) only ever return
 * publishable fields, with minors' names masked per division. A session is
 * still READ on every host (one Clerk instance across play./admin./compete.
 * and, through satellite domains, the brand sites), so chrome lights up for a
 * signed-in visitor; what must never happen is a signed-OUT visitor being
 * turned away.
 *
 * Brand sites: the host map comes from the public manifest sites/hosts.json
 * (rewritten by Websites > Settings > Domains) with the code seed as the
 * fallback, cached in this isolate for a minute. `www.` aliases redirect 308
 * to the apex; staff-managed redirects (old addresses) answer 301 before the
 * route tree is consulted.
 *
 * Exempt from rewrite AND auth:
 *   /display/[token] — TV displays; the unguessable token is the credential.
 *   /sign-in, /sign-up — shared auth pages, identical on every host.
 *   /api, /_next — handled elsewhere / framework internals.
 */
const EXEMPT_PREFIXES = ['/display', '/sign-in', '/sign-up', '/api', '/_next'];

function isExempt(pathname: string): boolean {
  return EXEMPT_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

interface SitesManifest {
  hosts: SiteHostMap;
  /** brandKey -> the host every alias redirects to (Settings › Domains › Primary host). */
  primary: Record<string, string>;
  /** brandKey -> { fromPath: toPath } */
  redirects: Record<string, Record<string, string>>;
  /** Hosts configured as Clerk satellite domains. */
  satellites: string[];
}

const MANIFEST_TTL_MS = 60_000;
let manifestCache: { at: number; value: SitesManifest | null } = { at: 0, value: null };

function manifestUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base}/storage/v1/object/public/brand-assets/sites/hosts.json` : null;
}

/** Live host manifest, cached per isolate; null when unavailable (seeds apply). */
async function sitesManifest(): Promise<SitesManifest | null> {
  const now = Date.now();
  if (now - manifestCache.at < MANIFEST_TTL_MS) return manifestCache.value;
  const url = manifestUrl();
  let value: SitesManifest | null = null;
  if (url) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const json = (await res.json()) as Partial<SitesManifest>;
        value = {
          hosts: json.hosts && typeof json.hosts === 'object' ? json.hosts : {},
          primary: json.primary && typeof json.primary === 'object' ? json.primary : {},
          redirects: json.redirects && typeof json.redirects === 'object' ? json.redirects : {},
          satellites: Array.isArray(json.satellites) ? json.satellites : [],
        };
      }
    } catch {
      value = null;
    }
  }
  manifestCache = { at: now, value };
  return value;
}

/**
 * Satellite hosts come ONLY from the manifest, i.e. the per-site "Clerk
 * satellite domain" checkbox. One switch, in the editor, no redeploy: a
 * satellite flag on a Clerk Hobby instance bounces every visitor to Play.
 */
function satelliteHosts(manifest: SitesManifest | null): string[] {
  return [...new Set(manifest?.satellites ?? [])];
}

const PRIMARY_SIGN_IN = process.env.CLERK_PRIMARY_SIGN_IN_URL
  ?? `${process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca'}/sign-in`;

/**
 * Host-aware Clerk options (Module 23 §1.3): a brand apex is a satellite of
 * the primary athleteinstitute.ca instance. Sign-in happens on the primary
 * (Play) and returns to the brand host, which is how Clerk's multi-domain
 * model works; the brand site's own /sign-in page links there.
 */
function clerkOptionsFor(req: NextRequest): ClerkMiddlewareOptions {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  const sats = satelliteHosts(manifestCache.value);
  if (host && sats.includes(host)) {
    return { isSatellite: true, domain: host, signInUrl: PRIMARY_SIGN_IN };
  }
  return {};
}

export default clerkMiddleware(async (auth, req) => {
  const manifest = await sitesManifest();
  const hostHeader = req.headers.get('host');
  const { pathname } = req.nextUrl;
  const forced = process.env.NODE_ENV !== 'production' || (hostHeader ?? '').endsWith('.vercel.app')
    ? req.nextUrl.searchParams.get('site') ?? req.cookies.get('ai_site_preview_brand')?.value ?? null
    : null;
  const resolved = resolveHost(hostHeader, { siteHosts: { ...SEEDED_SITE_HOSTS, ...(manifest?.hosts ?? {}) }, forcedBrand: forced });
  const app = resolved.app;

  // Downstream (layouts, guards) read the resolved app + original path from
  // these headers (layouts don't receive the pathname; the tenant gate in
  // app/play/layout.tsx needs it).
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-portal-app', app);
  requestHeaders.set('x-portal-path', pathname);
  if (app === 'site' && resolved.brandKey) {
    requestHeaders.set('x-site-brand', resolved.brandKey);
    requestHeaders.set('x-site-host', (hostHeader ?? '').toLowerCase());
  }

  if (isExempt(pathname)) {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    // Account-claim flow: /sign-up?claim=<token> (from the import's claim
    // email). The token is parked in a short-lived cookie so that after Clerk
    // finishes sign-up — with WHATEVER email the user chose — the first
    // getOrCreateProfile() can adopt the imported profile by token.
    if (pathname.startsWith('/sign-up')) {
      const claim = req.nextUrl.searchParams.get('claim');
      if (claim && /^[a-f0-9-]{16,64}$/i.test(claim)) {
        res.cookies.set('ai_claim_token', claim, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          maxAge: 3600,
          path: '/',
        });
      }
    }
    return res;
  }

  // Admin host: require a signed-in session before serving anything. The
  // role/staff gate runs in app/admin/layout.tsx (needs the full user).
  if (app === 'admin') {
    const { userId, redirectToSignIn } = await auth();
    if (!userId) {
      // Rebuild the return URL from the Host header — req.url reports the
      // server's own origin (localhost) in dev, which would bounce the user
      // to the play tree after sign-in instead of back to admin.
      const host = req.headers.get('host') ?? req.nextUrl.host;
      const returnBackUrl = `${req.nextUrl.protocol}//${host}${pathname}${req.nextUrl.search}`;
      return redirectToSignIn({ returnBackUrl });
    }
  }

  if (app === 'site' && resolved.brandKey) {
    // Alias hosts -> the site's primary host (308 keeps method + body). The
    // primary comes from Settings › Domains so it can match whichever host
    // Vercel's own domain redirect prefers; a mismatch there is a redirect
    // loop. Without a manifest: www -> apex.
    const bare = (hostHeader ?? '').toLowerCase().split(':')[0];
    const primary = manifest?.primary?.[resolved.brandKey];
    if (primary ? bare !== primary && manifest?.hosts?.[bare] === resolved.brandKey : resolved.wwwAlias) {
      const target = primary ?? bare.replace(/^www\./, '');
      return NextResponse.redirect(`https://${target}${pathname}${req.nextUrl.search}`, 308);
    }
    // Staff-managed redirects (old addresses, slug changes): 301 before routing.
    const to = manifest?.redirects?.[resolved.brandKey]?.[pathname.replace(/\/+$/, '') || '/'];
    if (to && to !== pathname) {
      const dest = /^https?:\/\//.test(to) ? to : `${req.nextUrl.protocol}//${hostHeader}${to}`;
      return NextResponse.redirect(dest, 301);
    }
    const url = req.nextUrl.clone();
    url.pathname = `/site/${resolved.brandKey}${pathname === '/' ? '' : pathname}`;
    const res = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    // Preview hosts: remember the forced brand so asset-less navigation keeps working.
    if (forced && req.nextUrl.searchParams.get('site')) {
      res.cookies.set('ai_site_preview_brand', forced, { sameSite: 'lax', maxAge: 3600, path: '/' });
    }
    return res;
  }

  const url = req.nextUrl.clone();
  url.pathname = `/${app}${pathname === '/' ? '' : pathname}`;
  return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
}, clerkOptionsFor);

export const config = {
  // Everything except Next internals and static files; always run for API.
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|webmanifest)).*)',
    '/(api)(.*)',
  ],
};
