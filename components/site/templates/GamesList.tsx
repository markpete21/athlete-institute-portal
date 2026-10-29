import Link from 'next/link';
import { Chev, PageHead, Section, SecHead, StatusPill } from '@/components/site/ui';
import { fmtDateStacked, fmtTime } from '@/lib/site/context';
import { listDivisions, recentResults, upcomingGames, type UpcomingGame } from '@/lib/compete/compete';

/**
 * Schedules / Results / Scores (ALL CAN §5): game rows grouped by date in the
 * brand date format, venue under the heading, time and court, home team,
 * score or "vs", away team (winner in semibold), status pill. Location first,
 * then division, through plain links (no client state).
 */
type Row = UpcomingGame & { homeScore?: number; awayScore?: number; overtime?: boolean };

const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });

export async function GamesList({ brandKey, mode, division }: { brandKey: string; mode: 'scores' | 'schedule' | 'results'; division?: string }) {
  const divs = await listDivisions(brandKey);
  const divId = division ? Number(division) : 0;
  const [up, fin] = await Promise.all([
    mode === 'results' ? [] : upcomingGames(60, brandKey),
    mode === 'schedule' ? [] : recentResults(60, brandKey),
  ]);
  const games: Row[] = [...(mode === 'results' ? [] : up), ...(mode === 'schedule' ? [] : fin)].filter((g) => !divId || g.divisionId === divId);
  const title = mode === 'scores' ? 'Schedules and results.' : mode === 'schedule' ? 'Schedules.' : 'Results.';
  const lede = mode === 'scores' ? 'Upcoming games and final scores for every division.' : mode === 'schedule' ? 'Upcoming games for every division.' : 'Final scores, newest first.';
  const groups = new Map<string, Row[]>();
  for (const g of games) { const k = g.startsAt ? dayKey(g.startsAt) : 'TBD'; groups.set(k, [...(groups.get(k) ?? []), g]); }
  const ordered = [...groups.entries()].sort((a, b) => (mode === 'results' ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0])));
  const base = `/${mode}`;
  return (
    <>
      <PageHead kicker="Compete" title={title} lede={lede} crumbs={[['Home', '/'], [title.replace(/\.$/, ''), '']]} />
      <Section tight>
        <div className="filters">
          <span className="label" style={{ alignSelf: 'center' }}>Division</span>
          <div className="tabs" style={{ margin: 0 }}>
            <Link href={base} className="tab" aria-pressed={!divId} role="button">All divisions</Link>
            {divs.map((d) => <Link key={d.id} href={`${base}?division=${d.id}`} className="tab" aria-pressed={divId === d.id} role="button">{d.name}</Link>)}
          </div>
          <div className="tabs" style={{ margin: 0 }}>
            {mode !== 'scores' && <Link href="/scores" className="tab" role="button">All games</Link>}
            {mode !== 'schedule' && <Link href="/schedule" className="tab" role="button">Upcoming</Link>}
            {mode !== 'results' && <Link href="/results" className="tab" role="button">Results</Link>}
          </div>
        </div>
        {games.length === 0 && <p className="muted" style={{ marginTop: 24 }}>{divs.length === 0 ? 'No divisions are published yet.' : mode === 'results' ? 'No results yet.' : 'No upcoming games published.'}</p>}
        {ordered.map(([k, list]) => {
          const [wd, md, yr] = fmtDateStacked(list[0].startsAt || null);
          return (
            <div key={k}>
              <h3 style={{ margin: '34px 0 6px' }}>{k === 'TBD' ? 'Date to be confirmed' : `${wd} / ${md} / ${yr}`}</h3>
              {list[0].facilityName && <p className="note">{list[0].facilityName}</p>}
              {list.map((g) => {
                const fin = g.homeScore != null && g.awayScore != null;
                const hw = fin && g.homeScore! > g.awayScore!, aw = fin && g.awayScore! > g.homeScore!;
                return (
                  <Link key={g.id} className="game" href={`/standings/${g.divisionId}`}>
                    <span className="when"><b>{fmtTime(g.startsAt || null)}</b><span className="note">{g.divisionName}{g.facilityName ? ` · ${g.facilityName}` : ''}</span></span>
                    <span className="teams"><span style={{ fontWeight: hw ? 600 : 400 }}>{g.homeTeam}</span><i>{fin ? `${g.homeScore}–${g.awayScore}` : 'vs'}</i><span style={{ fontWeight: aw ? 600 : 400 }}>{g.awayTeam}</span></span>
                    <span><StatusPill label={fin ? `Final${g.overtime ? ' · OT' : ''}` : 'Upcoming'} live={false} /><Chev /></span>
                  </Link>
                );
              })}
            </div>
          );
        })}
        {divs.length > 0 && <div style={{ marginTop: 40 }}><SecHead label="Standings" /><div className="bigbtns"><Link className="bigbtn" href="/standings"><span>Standings</span><Chev /></Link><Link className="bigbtn" href="/rosters"><span>Rosters</span><Chev /></Link></div></div>}
      </Section>
    </>
  );
}
