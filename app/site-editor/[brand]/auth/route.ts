import { NextRequest, NextResponse } from 'next/server';
import { EDITOR_COOKIE_MAX_AGE, editorCookieName, mintEditorCookie, verifyHandoffToken } from '@/lib/site/editor-session';

export const dynamic = 'force-dynamic';

/** <site>/admin/auth?token=… : swap the Admin hand-off token for the 12-hour editor cookie, then open the editor. */
export async function GET(req: NextRequest, { params }: { params: { brand: string } }) {
  const pid = verifyHandoffToken(req.nextUrl.searchParams.get('token'), params.brand);
  const editor = new URL('/admin', req.url);
  if (!pid) {
    editor.searchParams.set('expired', '1');
    return NextResponse.redirect(editor, 303);
  }
  const res = NextResponse.redirect(editor, 303);
  res.cookies.set(editorCookieName(params.brand), mintEditorCookie(params.brand, pid), { httpOnly: true, sameSite: 'lax', secure: req.nextUrl.protocol === 'https:', path: '/', maxAge: EDITOR_COOKIE_MAX_AGE });
  return res;
}
