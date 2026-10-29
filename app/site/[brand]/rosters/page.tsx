import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Chev, PageHead, Section, SecHead } from '@/components/site/ui';
import { siteContext } from '@/lib/site/context';
import { divisionDetail, listDivisions } from '@/lib/compete/compete';
import { getPageBySlug } from '@/lib/site/pages';
import { pageDescription, pageTitle } from '@/lib/site/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { brand: string } }): Promise<Metadata> {
  const ctx = await siteContext(params.brand);
  const page = ctx && (await getPageBySlug(params.brand, 'rosters'));
  if (!ctx || !page) return {};
  return { title: { absolute: pageTitle(ctx.site, page) }, description: pageDescription(ctx.site, page), alternates: { canonical: `${ctx.origin}/rosters` } };
}

/**
 * Rosters (ALL CAN §5): one page with a Teams / Players switch. Teams: hairline
 * rows per division with record. Players: portrait grid of players with
 * guardian permission only (masked names never appear here; a hidden member
 * is not listed), searchable by display name. Names come masked from
 * lib/compete.
 */
export default async function RostersPage({ params, searchParams }: { params: { brand: string }; searchParams: { view?: string; q?: string; division?: string } }) {
  const ctx = await siteContext(params.brand);
  if (!ctx) notFound();
  const view = searchParams.view === 'players' ? 'players' : 'teams';
  const divs = await listDivisions(params.brand);
  const details = await Promise.all(divs.map((d) => divisionDetail(d.id)));
  const q = (searchParams.q ?? '').trim().toLowerCase();
  const divId = searchParams.division ? Number(searchParams.division) : 0;
  return (
    <>
      <PageHead kicker="Compete" title="Rosters." lede="Teams and players by division." crumbs={[['Home', '/'], ['Rosters', '']]} />
      <Section tight>
        <div className="tabs" role="group" aria-label="Show">
          <Link href="/rosters" className="tab" role="button" aria-pressed={view === 'teams'}>Teams</Link>
          <Link href="/rosters?view=players" className="tab" role="button" aria-pressed={view === 'players'}>Players</Link>
        </div>
        {divs.length === 0 && <p className="muted">Rosters appear here once divisions are published.</p>}
        {view === 'teams' ? details.map((d) => d && (
          <div key={d.division.id} style={{ marginBottom: 32 }}>
            <SecHead label={d.division.name} right={<Link href={`/standings/${d.division.id}`}>Standings</Link>} />
            <div className="rows">
              {d.standings.standings.map((r) => {
                const name = d.standings.teamNames.get(r.team) ?? 'Team';
                return <Link key={r.team} className="row" href={`/standings/${d.division.id}#rosters`}><h3>{name}</h3><span className="meta">{d.division.programName ?? ''} · {r.w}–{r.l}</span><span className="end"><Chev /></span></Link>;
              })}
              {d.standings.standings.length === 0 && [...new Set(d.rosters.map((r) => r.teamName))].map((t) => <Link key={t} className="row" href={`/standings/${d.division.id}#rosters`}><h3>{t}</h3><span className="meta">{d.division.name}</span><span className="end"><Chev /></span></Link>)}
            </div>
          </div>
        )) : (
          <>
            <form className="filters" method="get" action="/rosters">
              <input type="hidden" name="view" value="players" />
              <label htmlFor="pl-q">Search<input id="pl-q" name="q" type="search" placeholder="Display name" defaultValue={searchParams.q ?? ''} /></label>
              <label htmlFor="pl-div">Division<select id="pl-div" name="division" defaultValue={String(divId || '')}><option value="">All divisions</option>{divs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
              <button type="submit" className="pill pill--line pill--sm" style={{ alignSelf: 'end' }}>Filter</button>
            </form>
            <div className="people">
              {details.flatMap((d) => d ? d.rosters.filter((r) => r.displayName !== 'Team member' && (!divId || d.division.id === divId) && (!q || r.displayName.toLowerCase().includes(q))).map((r) => {
                const ini = r.displayName.split(/\s+/).map((w) => w[0]).join('').toUpperCase();
                const inner = <><div className="portrait" aria-hidden="true"><b>{ini}</b></div><span className="nm">{r.displayName}</span><span className="tm">{r.teamName} · {d.division.name}</span></>;
                return d.division.statsEnabled ? <Link key={r.memberId} className="person" href={`/standings/${d.division.id}/player/${r.memberId}`}>{inner}</Link> : <div key={r.memberId} className="person">{inner}</div>;
              }) : [])}
            </div>
            <p className="note" style={{ marginTop: 16 }}>Only players with guardian permission appear. Names follow each division&apos;s privacy setting.</p>
          </>
        )}
      </Section>
    </>
  );
}
