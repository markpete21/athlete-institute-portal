import { NextRequest, NextResponse } from 'next/server';
import { editorCookieName } from '@/lib/site/editor-session';

export const dynamic = 'force-dynamic';

/** Clears the editor cookie on this host and returns to the site. */
export async function GET(req: NextRequest, { params }: { params: { brand: string } }) {
  const res = NextResponse.redirect(new URL('/', req.url), 303);
  res.cookies.set(editorCookieName(params.brand), '', { maxAge: 0, path: '/' });
  return res;
}
