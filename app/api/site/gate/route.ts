import { NextRequest, NextResponse } from 'next/server';
import { getSite } from '@/lib/site/sites';
import { gateCookieName, gateToken } from '@/lib/site/preview';

export const dynamic = 'force-dynamic';

const attempts = new Map<string, { n: number; at: number }>();

/** Password gate unlock: right password → 30-day cookie and back to the page; wrong → back with ?gate=wrong. */
export async function POST(req: NextRequest) {
  const fd = await req.formData();
  const brandKey = String(fd.get('brandKey') ?? '');
  const password = String(fd.get('password') ?? '');
  const backPath = String(fd.get('back') ?? '/').replace(/^(?!\/)/, '/').split('#')[0];
  const back = new URL(backPath, req.url);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon';
  const key = `${brandKey}:${ip}`;
  const a = attempts.get(key);
  if (a && a.n >= 20 && Date.now() - a.at < 900_000) return new NextResponse('Too many attempts. Try again in 15 minutes.', { status: 429 });
  const site = await getSite(brandKey);
  const expected = site?.settings.gate_password ?? null;
  if (!site || !expected || password !== expected) {
    attempts.set(key, { n: (a && Date.now() - a.at < 900_000 ? a.n : 0) + 1, at: Date.now() });
    back.searchParams.set('gate', 'wrong');
    return NextResponse.redirect(back, 303);
  }
  attempts.delete(key);
  const res = NextResponse.redirect(back, 303);
  res.cookies.set(gateCookieName(brandKey), gateToken(brandKey, expected), { httpOnly: true, sameSite: 'lax', secure: req.nextUrl.protocol === 'https:', path: '/', maxAge: 30 * 86_400 });
  return res;
}
