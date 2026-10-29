import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PlayerPage from '@/components/compete/PlayerPage';
import { siteContext } from '@/lib/site/context';
import { divisionDetail, playerProfile } from '@/lib/compete/compete';

export const dynamic = 'force-dynamic';

/** Player profiles are never indexed on brand sites (youth privacy). */
export async function generateMetadata({ params }: { params: { brand: string; id: string; pid: string } }): Promise<Metadata> {
  const p = await playerProfile(Number(params.id), Number(params.pid));
  return { title: p ? { absolute: `${p.name} · ${p.teamName}` } : undefined, robots: { index: false, follow: false } };
}

export default async function SitePlayerPage({ params }: { params: { brand: string; id: string; pid: string } }) {
  const ctx = await siteContext(params.brand);
  if (!ctx) notFound();
  const divisionId = Number(params.id);
  const [profile, detail] = await Promise.all([playerProfile(divisionId, Number(params.pid)), divisionDetail(divisionId)]);
  if (!profile || !detail || (detail.division.brandKey && detail.division.brandKey !== params.brand)) notFound();
  return <div className="wrap site-compete"><PlayerPage profile={profile} division={detail.division} divisionHref={`/standings/${divisionId}`} /></div>;
}
