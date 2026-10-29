import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { brandSiteUrl } from '@ai/foundation';
import DivisionPage from '@/components/compete/DivisionPage';
import { divisionDetail, divisionStats } from '@/lib/compete/compete';
import { loadBrandSiteUrls } from '@/lib/site/sites';

export const dynamic = 'force-dynamic';

const PLAY_URL = process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca';

/** Compete's division page: the shared component, with Compete's own paths.
 *  When the division's brand has a LIVE site, that copy is canonical and a
 *  "View on <site>" link appears (Module 23 §3.2). No redirects. */
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const detail = await divisionDetail(Number(params.id));
  if (!detail) return {};
  await loadBrandSiteUrls();
  const site = brandSiteUrl(detail.division.brandKey);
  const program = detail.division.programName;
  return {
    title: `${detail.division.name}${program ? ` · ${program}` : ''} — Compete. Athlete Institute`,
    alternates: site ? { canonical: `${site}/standings/${detail.division.id}` } : undefined,
  };
}

export default async function CompeteDivisionPage({ params }: { params: { id: string } }) {
  const detail = await divisionDetail(Number(params.id));
  if (!detail) notFound();
  const [stats] = await Promise.all([detail.division.statsEnabled ? divisionStats(detail.division.id) : null, loadBrandSiteUrls()]);
  const site = brandSiteUrl(detail.division.brandKey);
  return (
    <DivisionPage
      detail={detail}
      stats={stats}
      paths={{ division: (id) => `/${id}`, player: (d, m) => `/${d}/player/${m}`, league: (p) => `/p/${p}`, index: '/', indexLabel: 'All divisions' }}
      footer={
        <section className="cs-cta">
          <div>
            <b>Want to play?</b>
            <span>Registration, schedules and payments all live in Play. App.</span>
          </div>
          {site ? (
            <a className="cs-cta-btn" href={`${site}/standings/${detail.division.id}`}>View on {site.replace(/^https?:\/\//, '')} →</a>
          ) : (
            <a className="cs-cta-btn" href={`${PLAY_URL}/programs`}>Register on Play. App →</a>
          )}
        </section>
      }
    />
  );
}
