import { NextRequest, NextResponse } from 'next/server';
import { resolvePortalApp } from '@ai/foundation';

/**
 * Subdomain routing (Module 0 §1).
 *
 * One codebase, two hostnames. The host decides which route tree serves the
 * request: play.* rewrites to /play/*, admin.* rewrites to /admin/*. Direct
 * path access to the "wrong" tree 404s naturally (a play-host request for
 * /admin/x becomes /play/admin/x, which doesn't exist).
 *
 * /display/[token] (Module 2 TV displays) is served as-is on any host and is
 * exempt from auth — the token IS the credential (Stage 2 auth must keep this
 * exemption).
 */
export function middleware(req: NextRequest) {
  const app = resolvePortalApp(req.headers.get('host'));
  const { pathname } = req.nextUrl;

  // Downstream (layouts, guards) read the resolved app from this header.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-portal-app', app);

  // Public token URLs: no rewrite, no auth.
  if (pathname === '/display' || pathname.startsWith('/display/')) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const url = req.nextUrl.clone();
  url.pathname = `/${app}${pathname === '/' ? '' : pathname}`;
  return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
}

export const config = {
  // Everything except Next internals, API routes, and static files.
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
