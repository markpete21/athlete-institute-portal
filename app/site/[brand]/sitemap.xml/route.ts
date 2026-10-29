import { NextResponse } from 'next/server';
import { siteContext } from '@/lib/site/context';
import { sitemapEntries } from '@/lib/site/seo';

export const dynamic = 'force-dynamic';

/** Per-host sitemap: published pages, locations, programs and stories. Empty until the site is live. */
export async function GET(_req: Request, { params }: { params: { brand: string } }) {
  const ctx = await siteContext(params.brand);
  if (!ctx) return new NextResponse('Not found', { status: 404 });
  const entries = await sitemapEntries(ctx.site, ctx.origin);
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map((e) => `  <url><loc>${esc(e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod.slice(0, 10)}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;
  return new NextResponse(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=600' } });
}
