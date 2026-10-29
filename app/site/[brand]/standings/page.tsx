import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Chev, PageHead, Section, SecHead } from '@/components/site/ui';
import { siteContext } from '@/lib/site/context';
import { listDivisions } from '@/lib/compete/compete';
import { listLocations } from '@/lib/site/records';
import { getPageBySlug } from '@/lib/site/pages';
import { pageDescription, pageTitle } from '@/lib/site/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { brand: string } }): Promise<Metadata> {
  const ctx = await siteContext(params.brand);
  const page = ctx && (await getPageBySlug(params.brand, 'standings'));
  if (!ctx || !page) return {};
  return { title: { absolute: pageTitle(ctx.site, page) }, description: pageDescription(ctx.site, page), alternates: { canonical: `${ctx.origin}/standings` } };
}

/** Standings index: every published division for THIS brand, grouped by program (Module 23 §3). */
export default async function StandingsIndex({ params }: { params: { brand: string } }) {
  const ctx = await siteContext(params.brand);
  if (!ctx) notFound();
  const [divs, locs] = await Promise.all([listDivisions(params.brand), listLocations(params.brand)]);
  const groups = new Map<string, typeof divs>();
  for (const d of divs) groups.set(d.programName ?? d.sport, [...(groups.get(d.programName ?? d.sport) ?? []), d]);
  return (
    <>
      <PageHead kicker="Compete" title="Standings." lede="Updated when scores are entered. Pick a division." crumbs={[['Home', '/'], ['Standings', '']]} />
      <Section tight>
        {divs.length === 0 && <p className="muted">No divisions are published yet. Standings appear here once a season is underway{locs.length ? ` at ${locs.map((l) => l.name).join(' and ')}` : ''}.</p>}
        {[...groups.entries()].map(([program, list]) => (
          <div key={program} style={{ marginBottom: 36 }}>
            <SecHead label={program} right={list[0]?.programId ? <Link href={`/leagues/${list[0].programId}`}>League page</Link> : undefined} />
            <div className="rows">
              {list.map((d) => <Link key={d.id} className="row" href={`/standings/${d.id}`}><h3>{d.name}</h3><span className="meta">{d.tournamentMode ? 'Tournament' : d.sport} · {d.teamCount} team{d.teamCount === 1 ? '' : 's'}</span><span className="end"><Chev /></span></Link>)}
            </div>
          </div>
        ))}
      </Section>
    </>
  );
}
