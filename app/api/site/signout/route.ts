import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { editorCookieName } from '@/lib/site/editor-session';

export const dynamic = 'force-dynamic';

/**
 * Sign out on a brand host. Brand hosts are Clerk satellites, so the session
 * is revoked server-side and the visitor returns to the page they were on;
 * Clerk's client-side cookie clears on the next request.
 */
export async function GET(req: NextRequest) {
  const back = new URL(req.nextUrl.searchParams.get('back') ?? '/', req.url);
  try {
    const { sessionId } = await auth();
    if (sessionId) { const clerk = await clerkClient(); await clerk.sessions.revokeSession(sessionId); }
  } catch { /* already signed out */ }
  const res = NextResponse.redirect(back, 303);
  for (const c of req.cookies.getAll()) if (c.name.startsWith('__session') || c.name.startsWith('__client')) res.cookies.set(c.name, '', { maxAge: 0, path: '/' });
  const brand = req.headers.get('x-site-brand');
  if (brand) res.cookies.set(editorCookieName(brand), '', { maxAge: 0, path: '/' });
  return res;
}
