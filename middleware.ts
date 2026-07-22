import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { resolvePortalApp } from '@ai/foundation';

/**
 * Subdomain routing (Module 0 §1) + auth wiring (Module 0 §3), one middleware.
 *
 * The host decides which route tree serves the request: play.* → /play/*,
 * admin.* → /admin/*. Direct path access to the wrong tree 404s by construction
 * (a play-host request for /admin/x becomes /play/admin/x, which doesn't exist).
 *
 * Auth model (mirrors the live app): middleware only enforces a *signed-in
 * session* for the admin host — the staff ROLE check needs the full user record
 * and lives in the /admin layout guard (requireStaff). play.* is open (tenants'
 * read-only gate + the rest come with Module 1).
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

  // Downstream (layouts, guards) read the resolved app from this header.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-portal-app', app);

  if (isExempt(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
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
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|webmanifest)).*)',
    '/(api)(.*)',
  ],
};
