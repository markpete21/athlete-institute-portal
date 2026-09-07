import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { resolvePortalApp } from '@ai/foundation';

/**
 * Subdomain routing (Module 0 §1) + auth wiring (Module 0 §3), one middleware.
 *
 * The host decides which route tree serves the request: play.* → /play/*,
 * admin.* → /admin/*, compete.* → /compete/*. Direct path access to the wrong tree 404s by construction
 * (a play-host request for /admin/x becomes /play/admin/x, which doesn't exist).
 *
 * Auth model (mirrors the live app): middleware only enforces a *signed-in
 * session* for the admin host — the staff ROLE check needs the full user record
 * and lives in the /admin layout guard (requireStaff). play.* is open (tenants'
 * read-only gate + the rest come with Module 1).
 *
 * compete.* (Compete. Portal) is FULLY PUBLIC by design — standings, schedules
 * and rosters are readable with no session at all. Nothing below gates it, and
 * the data layer (lib/compete) only ever returns publishable fields, with
 * minors' names masked per division. Do not add an auth check here without
 * revisiting that: the whole point is that a parent can send a grandparent a
 * link to the standings.
 *
 * Public does NOT mean session-blind. clerkMiddleware wraps every host, so a
 * session is READ on compete.* like anywhere else — one Clerk instance across
 * play./admin./compete. means signing in on any of them carries to the others
 * with no re-login, and /sign-in served on the compete host returns the visitor
 * to the page they were on. Chrome and features may light up for a signed-in visitor; what must
 * never happen is a signed-OUT visitor being turned away.
 *
 * Exempt from rewrite AND auth:
 *   /display/[token] — TV displays; the unguessable token is the credential.
 *   /sign-in, /sign-up — shared auth pages, identical on both hosts.
 *   /api, /_next — handled elsewhere / framework internals.
 */
const EXEMPT_PREFIXES = ['/display', '/sign-in', '/sign-up', '/api', '/_next'];

function isExempt(pathname: string): boolean {
  return EXEMPT_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export default clerkMiddleware(async (auth, req) => {
  const app = resolvePortalApp(req.headers.get('host'));
  const { pathname } = req.nextUrl;

  // Downstream (layouts, guards) read the resolved app + original path from
  // these headers (layouts don't receive the pathname; the tenant gate in
  // app/play/layout.tsx needs it).
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-portal-app', app);
  requestHeaders.set('x-portal-path', pathname);

  // The /api/dev/* verify harnesses are development tooling. Each route also
  // gates on NODE_ENV, but one forgotten line must not ship a route that
  // writes to the production database — block the whole prefix here.
  if (pathname.startsWith('/api/dev') && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (isExempt(pathname)) {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    // Account-claim flow: /sign-up?claim=<token> (from the import's claim
    // email). The token is parked in a short-lived cookie so that after Clerk
    // finishes sign-up — with WHATEVER email the user chose — the first
    // getOrCreateProfile() can adopt the imported profile by token.
    if (pathname.startsWith('/sign-up')) {
      const cookie = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/' };
      const claim = req.nextUrl.searchParams.get('claim');
      if (claim && /^[a-f0-9-]{16,64}$/i.test(claim)) {
        res.cookies.set('ai_claim_token', claim, { ...cookie, maxAge: 3600 });
      }
      // Referral link (Module 19): /sign-up?ref=<code>. Parked for 30 days so
      // the referral is recorded when the household is first created, even if
      // sign-up finishes days later; rewards fire on the first PAID registration.
      const ref = req.nextUrl.searchParams.get('ref');
      if (ref && /^[A-Za-z0-9_-]{4,32}$/.test(ref)) {
        res.cookies.set('ai_referral_code', ref, { ...cookie, maxAge: 30 * 86400 });
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

  const url = req.nextUrl.clone();
  url.pathname = `/${app}${pathname === '/' ? '' : pathname}`;
  return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
});

export const config = {
  // Everything except Next internals and static files; always run for API.
  matcher: [
    // Anchored: only a path that ENDS in a static extension is exempt, so
    // /admin/accounts/5.css or /play/p/abc.png cannot bypass auth + rewrite.
    '/((?!_next|.*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|webmanifest)$).*)',
    '/(api)(.*)',
  ],
};
