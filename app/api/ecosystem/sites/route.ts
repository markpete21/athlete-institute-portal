import { NextResponse } from 'next/server';
import { listSites, siteOrigin } from '@/lib/site/sites';

export const dynamic = 'force-dynamic';

/**
 * PUBLIC brand-site manifest (Module 23 §5). Other Athlete Institute apps
 * (Play, Compete, live stream, tickets) fetch this to link "View on
 * allcansport.ca" and to know which brands have a live public site.
 * Unauthenticated: hostnames and statuses only, nothing private.
 */
export async function GET() {
  const sites = await listSites();
  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      sites: sites.map((s) => ({ brandKey: s.brandKey, name: s.name, status: s.status, origin: s.status === 'live' ? siteOrigin(s) : null, hostnames: s.hostnames, primaryHost: s.primaryHost, themeKey: s.themeKey, launchedAt: s.launchedAt })),
    },
    { headers: { 'cache-control': 'public, s-maxage=300, stale-while-revalidate=600' } },
  );
}
