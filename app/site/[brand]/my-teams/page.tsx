import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Chev, FactsDl, PageHead, Section, SecHead, SplitGrid } from '@/components/site/ui';
import { siteContext } from '@/lib/site/context';
import { getPortalSession } from '@/lib/auth';
import { followedTeams } from '@/lib/site/follows';
import { recentResults, upcomingGames } from '@/lib/compete/compete';
import { fmtDay, fmtTime } from '@/lib/site/context';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My teams', robots: { index: false } };

const PLAY_URL = process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca';

/** Signed in: followed teams, their next games and recent results, notification settings (ALL CAN §5). */
export default async function MyTeamsPage({ params }: { params: { brand: string } }) {
  const ctx = await siteContext(params.brand);
  if (!ctx) notFound();
  const COMPETE_URL = process.env.NEXT_PUBLIC_COMPETE_URL ?? 'https://compete.athleteinstitute.ca';
  if (!ctx.accountOnHost) {
    return (
      <>
        <PageHead kicker="Account" title="My teams." lede="Schedules, results and standings are all here. Your account lives on Play. App." crumbs={[['Home', '/'], ['My teams', '']]} />
        <div className="wrap" style={{ margin: '24px 0 80px', display: 'flex', gap: 10, flexWrap: 'wrap' }}><Link className="pill pill--ink" href="/scores">Schedules and results</Link><a className="pill pill--line" href={`${PLAY_URL}/account`}>My account on Play. App</a><a className="pill pill--line" href={COMPETE_URL}>Compete</a></div>
      </>
    );
  }
  let session = null as Awaited<ReturnType<typeof getPortalSession>> | null;
  try { session = await getPortalSession(); } catch { session = null; }
  if (!session?.userId || !session.profileId) {
    return (
      <>
        <PageHead kicker="Account" title="My teams." lede="Sign in to see the teams you follow and their schedule." crumbs={[['Home', '/'], ['My teams', '']]} />
        <div className="wrap" style={{ margin: '24px 0 80px' }}><a className="pill pill--ink" href={`${PLAY_URL}/sign-in?redirect_url=${encodeURIComponent(`${ctx.origin}/my-teams`)}`}>Sign in</a></div>
      </>
    );
  }
  const teams = (await followedTeams(session.profileId)).filter((t) => !t.brandKey || t.brandKey === params.brand);
  const ids = new Set(teams.map((t) => t.teamId));
  const names = new Set(teams.map((t) => t.teamName));
  const [up, fin] = await Promise.all([upcomingGames(60, params.brand), recentResults(60, params.brand)]);
  const mine = (g: { homeTeam: string; awayTeam: string }) => names.has(g.homeTeam) || names.has(g.awayTeam);
  const next = up.filter(mine).slice(0, 6), past = fin.filter(mine).slice(0, 3);
  return (
    <>
      <PageHead kicker={`Account · ${session.email ?? ''}`} title="My teams." lede="Teams you follow, their next games and recent results." crumbs={[['Home', '/'], ['My teams', '']]} />
      <Section tight>
        <SecHead label="Following" right={<Link href="/rosters">Find a team</Link>} />
        {teams.length ? <div className="rows">{teams.map((t) => <Link key={t.teamId} className="row" href={`/standings/${t.divisionId}#rosters`}><h3>{t.teamName}</h3><span className="meta">{t.divisionName}</span><span className="end"><span className="status status--live">Following</span><Chev /></span></Link>)}</div> : <p className="muted">You&apos;re not following any teams yet. Open a division&apos;s rosters and choose Follow this team.</p>}
      </Section>
      {ids.size > 0 && (
        <>
          <Section><SecHead label="Next games" />{next.length ? next.map((g) => <Link key={g.id} className="game" href={`/standings/${g.divisionId}`}><span className="when"><b>{fmtDay(g.startsAt)}</b><span className="note">{fmtTime(g.startsAt)}{g.facilityName ? ` · ${g.facilityName}` : ''}</span></span><span className="teams"><span>{g.homeTeam}</span><i>vs</i><span>{g.awayTeam}</span></span><span className="note">{g.divisionName}</span></Link>) : <p className="muted">No upcoming games.</p>}</Section>
          <Section><SecHead label="Recent results" />{past.map((g) => <Link key={g.id} className="game" href={`/standings/${g.divisionId}`}><span className="when"><b>{fmtDay(g.startsAt)}</b><span className="note">{g.divisionName}</span></span><span className="teams"><span>{g.homeTeam}</span><i>{g.homeScore}–{g.awayScore}</i><span>{g.awayTeam}</span></span><span className="note">Final{g.overtime ? ' · OT' : ''}</span></Link>)}</Section>
        </>
      )}
      <Section><SecHead label="Notifications" /><SplitGrid left={<h2>How we reach you.</h2>} right={<><FactsDl facts={[['Schedule changes', 'Email · on'], ['Final scores', 'Email · on'], ['Postponements', 'Email and text · on']]} /><p className="note" style={{ marginTop: 12 }}>Change channels in <a href={`${PLAY_URL}/account`} target="_blank" rel="noopener">your account on Play</a>.</p></>} /></Section>
    </>
  );
}
