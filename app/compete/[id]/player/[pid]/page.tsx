import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import PlayerPage from '@/components/compete/PlayerPage';
import { divisionDetail, playerProfile } from '@/lib/compete/compete';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string; pid: string } }): Promise<Metadata> {
  const p = await playerProfile(Number(params.id), Number(params.pid));
  if (!p) return {};
  return { title: `${p.name} · ${p.teamName} — Compete. Athlete Institute` };
}

/** Compete's player page: the shared component (see components/compete/PlayerPage). */
export default async function CompetePlayerPage({ params }: { params: { id: string; pid: string } }) {
  const divisionId = Number(params.id);
  const [profile, detail] = await Promise.all([
    playerProfile(divisionId, Number(params.pid)),
    divisionDetail(divisionId),
  ]);
  if (!profile || !detail) notFound();
  return <PlayerPage profile={profile} division={detail.division} divisionHref={`/${divisionId}`} />;
}
