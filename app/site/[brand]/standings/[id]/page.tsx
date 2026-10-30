import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import DivisionPage from '@/components/compete/DivisionPage';
import { siteContext } from '@/lib/site/context';
import { divisionDetail, divisionStats } from '@/lib/compete/compete';
import { followedTeamIds } from '@/lib/site/follows';
import { getPortalSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { brand: string; id: string } }): Promise<Metadata> {
  const ctx = await siteContext(params.brand);
  const detail = await divisionDetail(Number(params.id));
  if (!ctx || !detail || (detail.division.brandKey && detail.division.brandKey !== params.brand)) return {};
  const f = ctx.site.seo.title_formats?.team ?? `{Team} · {Division} · ${ctx.site.name}`;
  return { title: { absolute: f.replace('{Team} · ', '').replace('{Division}', detail.division.name) }, alternates: { canonical: `${ctx.origin}/standings/${detail.division.id}` }, robots: ctx.site.seo.index_team_pages === false ? { index: false } : undefined };
}

/** A division on the brand site: the shared Compete component with brand-site paths and Follow this team. */
export default async function SiteDivisionPage({ params }: { params: { brand: string; id: string } }) {
  const ctx = await siteContext(params.brand);
  if (!ctx) notFound();
  const detail = await divisionDetail(Number(params.id));
  // A division from another brand is a 404 here, never a leak.
  if (!detail || (detail.division.brandKey && detail.division.brandKey !== params.brand)) notFound();
  const stats = detail.division.statsEnabled ? await divisionStats(detail.division.id) : null;
  let followed = new Set<number>();
  let signedIn = false;
  if (ctx.accountOnHost) try {
    const s = await getPortalSession();
    signedIn = !!s.userId;
    if (s.profileId) followed = await followedTeamIds(s.profileId);
  } catch { /* no session on this host yet */ }
  const teamIds = new Map(detail.rosters.map((r) => [r.teamName, r.teamId]));
  return (
    <div className="wrap site-compete">
      <DivisionPage
        detail={detail}
        stats={stats}
        paths={{ division: (id) => `/standings/${id}`, player: (d, m) => `/standings/${d}/player/${m}`, league: (p) => `/leagues/${p}`, index: '/standings', indexLabel: 'All divisions' }}
        follow={ctx.accountOnHost ? { followed, teamIds, signedIn } : undefined}
        footer={<p className="note" style={{ margin: '24px 0 48px' }}>Names follow the division&apos;s privacy setting. Players without guardian permission show as &quot;Team member&quot;. <Link href="/scores">All games</Link></p>}
      />
    </div>
  );
}
