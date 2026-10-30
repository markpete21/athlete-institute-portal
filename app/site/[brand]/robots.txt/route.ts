import { NextResponse } from 'next/server';
import { siteContext } from '@/lib/site/context';
import { robotsTxt } from '@/lib/site/seo';

export const dynamic = 'force-dynamic';

/** Per-host robots.txt with the owner-confirmed AI crawler policy (answers allowed, training blocked). */
export async function GET(_req: Request, { params }: { params: { brand: string } }) {
  const ctx = await siteContext(params.brand);
  if (!ctx) return new NextResponse('User-agent: *\nDisallow: /\n', { headers: { 'content-type': 'text/plain' } });
  if (ctx.site.settings.gate_password) return new NextResponse('User-agent: *\nDisallow: /\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  return new NextResponse(robotsTxt(ctx.site, ctx.origin), { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=600' } });
}
