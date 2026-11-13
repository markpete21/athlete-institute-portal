import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import BlockRenderer, { SportTiles } from '@/components/site/blocks/BlockRenderer';
import ProgramBlock from '@/components/site/ProgramBlock';
import LeadForm from '@/components/site/LeadForm';
import ApplyDialog from '@/components/site/ApplyDialog';
import { fmtDateStacked, fmtTime } from '@/lib/site/context';
import { divisionsOf, listGames, listPlayers, listTeams, standings, type LeagueGame, type LeaguePlayer } from '@/lib/site/league';
import { Chev, Crumbs, FactsDl, PageHead, Row, SecHead, Section, SplitGrid, StatusPill, T } from '@/components/site/ui';
import { GameCard } from '@/components/compete/DivisionPage';
import { siteContext, type SiteContext } from '@/lib/site/context';
import { getPageBySlug, listPages, type SitePage } from '@/lib/site/pages';
import { getLocation, getProgram, getProgramLine, listLocations, listProgramLines, listPrograms, locationStatusLabel, programStatusLabel, SPORTS, sportBySlug, type ProgramLine, type SiteLocation } from '@/lib/site/records';
import { pageDescription, pageTitle, breadcrumbJsonLd } from '@/lib/site/seo';
import { PRIVACY_POLICY } from '@/lib/site/privacy-policy';
import { listDivisions, recentResults, upcomingGames } from '@/lib/compete/compete';
import type { Block } from '@/lib/site/blocks';
import { boxesFor, gameEvents, gameStatLines, gameStatsMeta, hasFullStats, reelsUrls, statLinesByGame, type StatLine, type TeamBox } from '@/lib/site/league-stats';
import { LeadersPage, PlayerStatsPage, ShotChart, TeamStatsPage, playerHref, teamHref } from '@/components/site/league/StatsPages';
import { pct, teamTotals, topLines } from '@/lib/site/boxscore';

export const dynamic = 'force-dynamic';

/**
 * Every page that isn't home, a story or a Compete page (those have their own
 * routes): custom pages, the locations finder, location hubs, sport-at-location,
 * sport overviews, the Circuit, training, parent guide, financial assistance,
 * about and the privacy policy. The site_pages row says which template
 * renders; its blocks are the editorial parts around the generated content.
 */
type Ctx = { site: SiteContext['site']; brandKey: string; preview: boolean };

async function resolve(brand: string, slugParts: string[], preview?: string | null): Promise<{ ctx: SiteContext; page: SitePage | null; slug: string } | null> {
  const ctx = await siteContext(brand, preview);
  if (!ctx) return null;
  const slug = slugParts.join('/');
  const page = await getPageBySlug(brand, slug);
  return { ctx, page, slug };
}

export async function generateMetadata({ params }: { params: { brand: string; slug: string[] } }): Promise<Metadata> {
  const r = await resolve(params.brand, params.slug);
  if (!r) return {};
  const { ctx, page, slug } = r;
  if (page) {
    return { title: { absolute: pageTitle(ctx.site, page) }, description: pageDescription(ctx.site, page), alternates: { canonical: `${ctx.origin}/${slug}` }, robots: page.seo.noindex ? { index: false } : undefined };
  }
  if (params.slug.length === 3 && params.slug[0] === 'circuit' && params.slug[1] === 'games') return { title: { absolute: `Full stats · ${ctx.site.name.replace(/\s+Sport$/, '')} Circuit` }, robots: { index: false, follow: true } };
  // Player pages stay out of search (youth players); team and leader pages may be indexed.
  if (params.slug.length === 3 && params.slug[0] === 'circuit' && params.slug[1] === 'players') return { title: { absolute: `Player stats · ${ctx.site.name.replace(/\s+Sport$/, '')} Circuit` }, robots: { index: false, follow: true } };
  if (params.slug.length === 3 && params.slug[0] === 'circuit' && params.slug[1] === 'teams') return { title: { absolute: `Team stats · ${ctx.site.name.replace(/\s+Sport$/, '')} Circuit` }, alternates: { canonical: `${ctx.origin}/${slug}` } };
  if (params.slug.length === 2 && params.slug[0] === 'circuit' && params.slug[1] === 'stats') return { title: { absolute: `Season leaders · ${ctx.site.name.replace(/\s+Sport$/, '')} Circuit` }, description: 'Scoring, rebounding and assist leaders, season highs and team stats for the ALL CAN Circuit.', alternates: { canonical: `${ctx.origin}/${slug}` } };
  // Location/sport pages without a page row still get a formatted title.
  if (params.slug.length === 2 && sportBySlug(params.slug[0])) {
    const line = await getProgramLine(params.brand, params.slug[0], params.slug[1]);
    if (line) return { title: { absolute: `${line.name} · ${ctx.site.name}` }, description: line.description ?? undefined, alternates: { canonical: `${ctx.origin}/${slug}` } };
  }
  const loc = await getLocation(params.brand, params.slug[0]);
  if (loc) return { title: { absolute: `${loc.name} · ${ctx.site.name}` }, alternates: { canonical: `${ctx.origin}/${slug}` } };
  return {};
}

export default async function SitePage({ params, searchParams }: { params: { brand: string; slug: string[] }; searchParams: { preview?: string; sport?: string; division?: string } }) {
  const r = await resolve(params.brand, params.slug, searchParams.preview);
  if (!r) notFound();
  const { ctx, page, slug } = r;
  const rctx: Ctx = { site: ctx.site, brandKey: ctx.site.brandKey, preview: ctx.preview };
  const blocks = (p: SitePage | null): Block[] => (p ? (ctx.preview ? p.blocksDraft : p.blocksPublished ?? []) : []);
  if (page && !ctx.preview && page.blocksPublished == null) notFound();

  // Records-driven templates can render without a page row (a new location
  // added by staff gets its row automatically; this is the belt and braces).
  const template = page?.template ?? (await inferTemplate(params.brand, params.slug));
  const crumbsJson = (crumbs: [string, string][]) => <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(ctx.origin, crumbs)) }} />;

  switch (template) {
    case 'custom': return (
      <>
        {crumbsJson([['Home', '/'], [page!.title, `/${slug}`]])}
        {!blocks(page).some((b) => b.type === 'hero') && <PageHead title={`${page!.title.replace(/\.$/, '')}.`} crumbs={[['Home', '/'], [page!.title, '']]} />}
        <BlockRenderer blocks={blocks(page)} ctx={rctx} />
      </>
    );
    case 'locations': return <LocationsFinder ctx={rctx} page={page} sport={searchParams.sport} />;
    case 'location': {
      const loc = await getLocation(params.brand, page?.ref ?? params.slug[0]);
      if (!loc) notFound();
      return <LocationHub ctx={rctx} loc={loc} page={page} />;
    }
    case 'location-sport': {
      const [ls, sp] = (page?.ref ?? slug).split('/');
      const loc = await getLocation(params.brand, ls);
      const sport = sportBySlug(sp);
      if (!loc || !sport) notFound();
      return <LocationSport ctx={rctx} loc={loc} sport={sport} page={page} />;
    }
    case 'program-line': {
      const [sp, ln] = (page?.ref ?? slug).split('/');
      const sport = sportBySlug(sp);
      const line = sport ? await getProgramLine(params.brand, sport.slug, ln) : null;
      if (!sport || !line) notFound();
      return <ProgramLinePage ctx={rctx} sport={sport} line={line} page={page} />;
    }
    case 'sport': {
      const sport = sportBySlug(page?.ref ?? params.slug[0]);
      if (!sport) notFound();
      return <SportOverview ctx={rctx} sport={sport} page={page} />;
    }
    case 'sport-soon': {
      const sport = sportBySlug(page?.ref ?? params.slug[0]);
      if (!sport) notFound();
      return (
        <>
          <PageHead kicker="Sport · Coming soon" title={`${sport.name}.`} lede={`${sport.programs.map((l) => l[0]).join(' and ')} are coming to ${ctx.site.name}.`} crumbs={[['Home', '/'], [sport.name, '']]} />
          <Section tight><SplitGrid left={<><h2>Be first<br />to know.</h2><p className="muted" style={{ marginTop: 12 }}>Locations and dates are coming soon.</p></>} right={<LeadForm brandKey={ctx.site.brandKey} variant="interest" context={sport.name} siteName={ctx.site.name} />} /></Section>
          <Section><SecHead label="Request near you" /><SplitGrid left={<h2>Bring {sport.name.toLowerCase()}<br />to your area.</h2>} right={<LeadForm brandKey={ctx.site.brandKey} variant="location" initialSport={sport.slug} siteName={ctx.site.name} />} /></Section>
          <BlockRenderer blocks={blocks(page)} ctx={rctx} />
        </>
      );
    }
    case 'circuit': return <Circuit ctx={rctx} page={page} division={searchParams.division} />;
    case 'league-game': return <LeagueGamePage ctx={rctx} gameId={Number(params.slug[2])} />;
    case 'league-player': return <PlayerStatsPage ctx={{ brandKey: rctx.brandKey, preview: rctx.preview, siteName: ctx.site.name }} leagueSlug="circuit" slug={params.slug[2]} />;
    case 'league-team': return <TeamStatsPage ctx={{ brandKey: rctx.brandKey, preview: rctx.preview, siteName: ctx.site.name }} leagueSlug="circuit" slug={params.slug[2]} />;
    case 'league-stats': return <LeadersPage ctx={{ brandKey: rctx.brandKey, preview: rctx.preview, siteName: ctx.site.name }} leagueSlug="circuit" division={searchParams.division} />;
    case 'training': {
      const skills = (await listPrograms(params.brand)).filter((p) => /skills/i.test(p.leagueType));
      const locs = await listLocations(params.brand);
      return (
        <>
          <PageHead kicker="Training" title="Training." lede="Skills sessions and private instruction. Each has its own facts and next step." crumbs={[['Home', '/'], ['Training', '']]} />
          {skills.length > 0 && <Section tight><SecHead label="Skills sessions" />{skills.map((p) => <ProgramBlock key={p.id} program={p} location={locs.find((l) => l.slug === p.locationSlug) ?? null} ctx={rctx} />)}</Section>}
          <BlockRenderer blocks={blocks(page)} ctx={rctx} />
        </>
      );
    }
    case 'stories': return notFound();
    case 'parent-guide': return (
      <>
        <PageHead kicker="Families" title="Parent guide." lede="How sessions, teams and policies work. Anything not yet confirmed is marked." crumbs={[['Home', '/'], ['Parent guide', '']]} />
        <BlockRenderer blocks={blocks(page)} ctx={rctx} />
      </>
    );
    case 'financial-assistance': return (
      <>
        <PageHead kicker="Families" title="Financial assistance." lede="Cost shouldn't decide who plays. Requests are confidential and kept separate from coaches." crumbs={[['Home', '/'], ['Financial assistance', '']]} />
        <BlockRenderer blocks={blocks(page)} ctx={rctx} />
      </>
    );
    case 'about': return <About ctx={rctx} page={page} />;
    case 'privacy-policy': return <PrivacyPolicy ctx={rctx} page={page} />;
    case 'programs': {
      const { ProgramsCatalog } = await import('@/components/site/templates/ProgramsCatalog');
      return <ProgramsCatalog ctx={rctx} page={page} />;
    }
    default: {
      // Pages with a known template but no renderer here live under their own route.
      if (page) return <><PageHead title={`${page.title.replace(/\.$/, '')}.`} crumbs={[['Home', '/'], [page.title, '']]} /><BlockRenderer blocks={blocks(page)} ctx={rctx} /></>;
      notFound();
    }
  }
}

async function inferTemplate(brand: string, parts: string[]): Promise<string> {
  if (parts.length === 1) {
    if (await getLocation(brand, parts[0])) return 'location';
    const sp = sportBySlug(parts[0]);
    if (sp) return sp.status === 'live' ? 'sport' : 'sport-soon';
    if (parts[0] === 'locations') return 'locations';
    if (parts[0] === 'privacy-policy') return 'privacy-policy';
  }
  if (parts.length === 2 && sportBySlug(parts[1]) && (await getLocation(brand, parts[0]))) return 'location-sport';
  if (parts.length === 2 && sportBySlug(parts[0]) && (await getProgramLine(brand, parts[0], parts[1]))) return 'program-line';
  if (parts.length === 3 && parts[0] === 'circuit' && parts[1] === 'games' && /^\d+$/.test(parts[2])) return 'league-game';
  if (parts.length === 3 && parts[0] === 'circuit' && parts[1] === 'players') return 'league-player';
  if (parts.length === 3 && parts[0] === 'circuit' && parts[1] === 'teams') return 'league-team';
  if (parts.length === 2 && parts[0] === 'circuit' && parts[1] === 'stats') return 'league-stats';
  return 'missing';
}

// ---------------------------------------------------------------------------

async function LocationsFinder({ ctx, page, sport }: { ctx: Ctx; page: SitePage | null; sport?: string }) {
  const locs = await listLocations(ctx.brandKey);
  // Grouped by province/region (Ontario), one hairline row per location.
  const regions = [...new Set(locs.map((l) => l.region || 'Canada'))];
  const blocks = page ? (ctx.preview ? page.blocksDraft : page.blocksPublished ?? []) : [];
  return (
    <>
      <PageHead kicker="Locations" title="Locations." lede="Pick a location to see its programs, venue details and schedule." crumbs={[['Home', '/'], ['Locations', '']]} />
      <Section tight><SplitGrid left={<h2>{regions.length === 1 ? `${regions[0]}.` : 'By province.'}</h2>} right={<>
        {regions.map((c) => (
          <div key={c}>
            {regions.length > 1 && <h3 style={{ margin: '8px 0 10px' }}>{c}.</h3>}
            <div className="rows">
              {locs.filter((l) => (l.region || 'Canada') === c).map((l) => { const st = locationStatusLabel(l); return <Row key={l.slug} href={`/${l.slug}`} title={l.name} meta={<>{l.venue}{l.address ? ` · ${l.address}` : ''}<br />{l.sports.map((s) => sportBySlug(s)?.name ?? s).join(', ')}</>} end={<StatusPill label={st.label} live={st.live} />} />; })}
            </div>
            <div style={{ height: 28 }} />
          </div>
        ))}
      </>} /></Section>
      <Section id="request">
        <SecHead label="Request a location · Host a program" />
        <SplitGrid rowGap={40}
          left={<>
            <h2>Bring {ctx.site.name.replace(/\s+Sport$/, '')}<br />to your area.</h2>
            <p className="muted" style={{ marginTop: 14 }}>Families can ask for a location or facility near them. Schools, community centres and facilities can host a program.</p>
            <span id="host" />
          </>}
          right={<LeadForm brandKey={ctx.brandKey} variant="location" initialSport={sport} siteName={ctx.site.name} />}
        />
      </Section>
      <BlockRenderer blocks={blocks} ctx={ctx} />
    </>
  );
}

async function LocationHub({ ctx, loc, page }: { ctx: Ctx; loc: SiteLocation; page: SitePage | null }) {
  const progs = await listPrograms(ctx.brandKey, { locationSlug: loc.slug });
  const st = locationStatusLabel(loc);
  const results = (await recentResults(12, ctx.brandKey)).filter((g) => !g.facilityName || !loc.venue || g.facilityName.toLowerCase().includes(loc.venue.toLowerCase().split(' ')[0])).slice(0, 3);
  const blocks = page ? (ctx.preview ? page.blocksDraft : page.blocksPublished ?? []) : [];
  return (
    <>
      <PhotoHead loc={loc} ctx={ctx} kicker={st.label} title={`${loc.name}.`} lede={progs.length ? `${progs.map((p) => p.name).join(' and ')} at ${loc.venue ?? loc.name}.` : ''} ledeNode={progs.some((p) => p.logoUrl) ? <><span className="lede-at">{loc.venue ?? loc.name}</span><span className="lede-logos">{progs.map((p, i) => <span key={p.id}>{i > 0 && ' and '}{p.logoUrl ? <LedeLogo url={p.logoUrl} name={p.name} /> : p.name}</span>)}</span></> : undefined} crumbs={[['Home', '/'], ['Locations', '/locations'], [loc.name, '']]} />
      <Section tight><SecHead label="Venue" /><SplitGrid
        left={<><h2>{loc.venue ?? loc.name}.</h2><p className="muted" style={{ marginTop: 12 }}>{[loc.city, loc.region].filter(Boolean).join(', ')}</p>{loc.note && <p className="note" style={{ marginTop: 8 }}><T preview={ctx.preview}>{loc.note}</T></p>}</>}
        right={<FactsDl preview={ctx.preview} facts={([
          // Only the rows a location has filled in (launch, Nov 3 2026: no "To be confirmed" rows).
          ['Address', loc.address ? <span className="addr">{loc.address}<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([loc.venue, loc.address].filter(Boolean).join(', '))}`} target="_blank" rel="noopener">Google Maps</a></span> : null],
          ['Parking', loc.parking], ['Arrival', loc.arrival], ['Contact', loc.contact ?? ctx.site.contact.email ?? null],
        ] as [string, React.ReactNode][]).filter((f) => f[1] != null && f[1] !== '')} />}
      />
        {loc.photos.length > 0 && <VenuePhotos photos={loc.photos} />}
      </Section>
      <Section><SecHead label="Programs here" /><div className="rows rows--programs">
        {loc.sports.map((s) => { const sp = sportBySlug(s); const here = progs.filter((p) => p.sport === s); return <Row key={s} href={`/${loc.slug}/${s}`} title={sp?.name ?? s} meta={here.map((p) => p.name).join(' · ')} end={<StatusPill label={st.label} live={st.live} />} />; })}
      </div></Section>
      <DevelopmentArm brandKey={ctx.brandKey} />
      {/* Season calendar hidden on location pages for now (owner, Nov 2 2026); the dates stay on the location record. */}
      {/* Only once a location has leaders entered (owner, Nov 2 2026: no [TBC] placeholder). */}
      {loc.leaders.length > 0 && <Section><SecHead label="Program leadership" /><SplitGrid
        left={<h2>Program<br />leadership.</h2>}
        right={<>
          {(
            <div className="leaders">{loc.leaders.map((l) => (
              <article key={l.name} className="leader">
                <div className="leader-photo">{l.photoUrl ? <LeaderPhoto url={l.photoUrl} name={l.name} /> : <span aria-hidden="true">{l.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}</span>}</div>
                <div><h3>{l.name}</h3>{l.role && <p className="kicker" style={{ marginTop: 4 }}>{l.role}</p>}{l.bio && <p className="muted" style={{ marginTop: 10 }}>{l.bio}</p>}</div>
              </article>
            ))}</div>
          )}
          <p className="muted" style={{ marginTop: 20 }}>Every coach is screened before working with players.</p>
          <CoachingPartners brandKey={ctx.brandKey} />
        </>}
      /></Section>}
      {results.length > 0 && <Section><SecHead label="Scores" right={<Link href="/scores">All games</Link>} /><div className="site-compete"><div className="cs-gamegrid">{results.map((g) => <GameCard key={g.id} g={{ id: g.id, startsAt: g.startsAt, round: null, stage: 'regular', status: 'final', homeTeamId: null, awayTeamId: null, homeTeam: g.homeTeam, awayTeam: g.awayTeam, homeScore: g.homeScore, awayScore: g.awayScore, overtime: g.overtime, liveStreamRef: g.liveStreamRef }} />)}</div></div></Section>}
      <BlockRenderer blocks={blocks} ctx={ctx} />
    </>
  );
}

async function LocationSport({ ctx, loc, sport, page }: { ctx: Ctx; loc: SiteLocation; sport: NonNullable<ReturnType<typeof sportBySlug>>; page: SitePage | null }) {
  const progs = await listPrograms(ctx.brandKey, { locationSlug: loc.slug, sport: sport.slug });
  const guide = (await listPages(ctx.brandKey)).find((p) => p.template === 'parent-guide');
  const faq = ((guide?.blocksPublished ?? []).find((b) => b.type === 'faq')?.props.items as { q: string; a: string; note?: string }[] | undefined)?.slice(0, 4) ?? [];
  const blocks = page ? (ctx.preview ? page.blocksDraft : page.blocksPublished ?? []) : [];
  // Landing-page mode: when the editor has put a hero on this page, the hero
  // leads, the program record(s) follow, then the rest of the blocks. The
  // generic head and the parent-guide FAQ step aside (the page brings its own).
  const heroIdx = blocks.findIndex((b) => b.type === 'hero' && !b.hidden);
  // A landing page that places a program block itself gets no automatic one.
  const placesProgram = blocks.some((b) => b.type === 'program_card' && !b.hidden);
  const landing = heroIdx >= 0;
  // A page menu right after the hero sits above the breadcrumbs, flush with the hero.
  const navNext = landing && blocks[heroIdx + 1]?.type === 'page_nav' ? 1 : 0;
  const lead = landing ? blocks.slice(0, heroIdx + 1 + navNext) : [];
  const rest = landing ? blocks.slice(heroIdx + 1 + navNext) : blocks;
  const ownFaq = blocks.some((b) => b.type === 'faq' && !b.hidden);
  const crumbs: [string, string][] = [['Home', '/'], ['Locations', '/locations'], [loc.name, `/${loc.slug}`], [sport.name, '']];
  return (
    <>
      {landing ? (
        <>
          <BlockRenderer blocks={lead} ctx={ctx} />
          <div className="wrap"><Crumbs items={crumbs} /></div>
        </>
      ) : (
        <PhotoHead loc={loc} ctx={ctx} kicker={`${loc.name} · ${sport.name}`} title={`${sport.name} in ${loc.name}.`} lede={`Every ${sport.name.toLowerCase()} program at ${loc.venue ?? loc.name}.`} crumbs={crumbs} />
      )}
      {!(landing && placesProgram) && <Section tight><SecHead label={progs.length === 1 ? 'The program' : 'Programs'} right={progs.length > 1 ? <span className="note">{progs.length} programs</span> : undefined} />
        {progs.map((p, i) => <ProgramBlock key={p.id} program={p} location={loc} ctx={ctx} primary={i === 0} />)}
        {progs.length === 0 && <p className="muted">No programs published here yet.</p>}
      </Section>}
      {!ownFaq && faq.length > 0 && <Section><SecHead label="Before you register" /><SplitGrid left={<h2>Good to know.</h2>} right={<div className="acc">{faq.map((f, i) => <details key={i}><summary>{f.q}<span className="chev down" aria-hidden="true" /></summary><div className="body"><p><T preview={ctx.preview}>{f.a}</T></p>{f.note && <p className="muted"><T preview={ctx.preview}>{f.note}</T></p>}</div></details>)}</div>} /></Section>}
      <BlockRenderer blocks={rest} ctx={ctx} />
    </>
  );
}

/**
 * /<sport>: the program pathway first (one row per program, linking to its
 * own landing page), then every location offering the sport. The browse-by-
 * program route from Play; locations are the other route.
 */
async function SportOverview({ ctx, sport, page }: { ctx: Ctx; sport: NonNullable<ReturnType<typeof sportBySlug>>; page: SitePage | null }) {
  const [locs, lines] = await Promise.all([listLocations(ctx.brandKey), listProgramLines(ctx.brandKey, sport.slug)]);
  const blocks = page ? (ctx.preview ? page.blocksDraft : page.blocksPublished ?? []) : [];
  const where = (l: ProgramLine) => [...new Set(l.programs.map((p) => locs.find((x) => x.slug === p.locationSlug)?.name ?? p.locationSlug))].join(' · ');
  return (
    <>
      <PageHead kicker="Play" title={`${ctx.site.name.replace(/\s+Sport$/, '')} ${sport.name}.`} lede={lines.length ? `${lines.length} program${lines.length === 1 ? '' : 's'}: ${lines.map((l) => l.name).join(', ')}.` : `${sport.name} programs are coming.`} crumbs={[['Home', '/'], [sport.name, '']]} />
      <Section tight><SecHead label="Programs" /><SplitGrid left={<h2>Where every<br />player fits.</h2>} right={<div className="rows">
        {lines.map((l) => <Link key={l.path} className="row" href={l.path}><div><p className="kicker muted">{l.type === 'Rep' ? 'Rep' : l.type}</p><h3 style={{ marginTop: 4 }}>{l.name}</h3></div><span className="meta">{l.description ?? ''}{l.description ? <br /> : null}{where(l)}</span><span className="end"><Chev /></span></Link>)}
      </div>} /></Section>
      {sport.slug === 'basketball' && <DevelopmentArm brandKey={ctx.brandKey} />}
      <Section><SecHead label="Where to play" /><div className="rows">
        {locs.filter((l) => l.sports.includes(sport.slug)).map((l) => { const st = locationStatusLabel(l); return <Row key={l.slug} href={`/${l.slug}/${sport.slug}`} title={l.name} meta={<>{l.venue}{l.city ? ` · ${l.city}` : ''}<br />{lines.filter((x) => x.programs.some((p) => p.locationSlug === l.slug)).map((x) => x.name).join(' · ')}</>} end={<StatusPill label={st.label} live={st.live} />} />; })}
      </div></Section>
      <BlockRenderer blocks={blocks} ctx={ctx} />
    </>
  );
}

/**
 * /<sport>/<program>: one program's own landing page (e.g. ALL CAN
 * Basketball Youth League). What it is, then every location running it with
 * its status, then a request form for anywhere else. Editors add more
 * through the page's blocks.
 */
async function ProgramLinePage({ ctx, sport, line, page }: { ctx: Ctx; sport: NonNullable<ReturnType<typeof sportBySlug>>; line: ProgramLine; page: SitePage | null }) {
  const locs = await listLocations(ctx.brandKey);
  const allBlocks = page ? (ctx.preview ? page.blocksDraft : page.blocksPublished ?? []) : [];
  // A page menu placed first sits right under the header (as on landing pages); the rest render after the locations.
  const navFirst = allBlocks[0]?.type === 'page_nav' ? [allBlocks[0]] : [];
  const blocks = navFirst.length ? allBlocks.slice(1) : allBlocks;
  const here = line.programs.map((p) => ({ p, loc: locs.find((l) => l.slug === p.locationSlug) ?? null }));
  const photoLoc = here.find((h) => h.loc?.photoUrl)?.loc ?? null;
  const first = line.programs[0];
  const shared = first ? first.facts.filter(([k]) => /age|format|session|level|includes|what/i.test(k)) : [];
  // The program's logo (e.g. ALL CAN Basketball League) stands in for the title when one is set.
  const titleLogoUrl = line.programs.find((p) => p.logoUrl)?.logoUrl ?? undefined;
  const head = { kicker: `${sport.name} · ${line.type}`, title: `${line.name}.`, lede: line.description ?? '', crumbs: [['Home', '/'], [sport.name, `/${sport.slug}`], [line.name, '']] as [string, string][], titleLogoUrl };
  return (
    <>
      {photoLoc ? <PhotoHead loc={photoLoc} ctx={ctx} {...head} /> : <PageHead {...head} preview={ctx.preview} />}
      {navFirst.length > 0 && <BlockRenderer blocks={navFirst} ctx={ctx} />}
      <Section tight id="program"><SecHead label="The program" /><SplitGrid
        left={<h2>What it is.</h2>}
        right={<>{line.description ? <p><T preview={ctx.preview}>{line.description}</T></p> : <p className="muted">Program details are <T preview={ctx.preview}>[TBC]</T>.</p>}{shared.length > 0 && <div style={{ marginTop: 20 }}><FactsDl facts={shared} preview={ctx.preview} /></div>}</>}
      /></Section>
      <Section id="locations"><SecHead label="Locations" right={<span className="note">{here.length} location{here.length === 1 ? '' : 's'}</span>} /><SplitGrid
        left={<h2>Where it<br />runs.</h2>}
        right={<div className="rows">{here.map(({ p, loc }) => { const st = programStatusLabel(p); return <Row key={p.id} href={`/${p.locationSlug}/${sport.slug}#${p.slug}`} title={loc?.name ?? p.locationSlug} meta={<>{loc?.venue ?? ''}{loc?.city ? ` · ${loc.city}, ${loc.region}` : ''}</>} end={<StatusPill label={st.label} live={st.live} />} />; })}</div>}
      /></Section>
      {sport.slug === 'basketball' && <DevelopmentArm brandKey={ctx.brandKey} />}
      <BlockRenderer blocks={blocks} ctx={ctx} />
      <Section id="request"><SecHead label="Not near you yet" /><SplitGrid left={<h2>Bring it<br />to your area.</h2>} right={<LeadForm brandKey={ctx.brandKey} variant="location" initialSport={sport.slug} siteName={ctx.site.name} />} /></Section>
    </>
  );
}

async function Circuit({ ctx, page, division }: { ctx: Ctx; page: SitePage | null; division?: string }) {
  const rep = (await listPrograms(ctx.brandKey)).find((p) => p.leagueType === 'Rep' || p.slug === 'circuit');
  const loc = rep ? await getLocation(ctx.brandKey, rep.locationSlug) : null;
  const blocks = page ? (ctx.preview ? page.blocksDraft : page.blocksPublished ?? []) : [];
  const games = await listGames(ctx.brandKey, rep?.slug ?? 'circuit');
  const teamRows = await listTeams(ctx.brandKey, rep?.slug ?? 'circuit');
  const players = await listPlayers(ctx.brandKey, rep?.slug ?? 'circuit');
  const stats = await statLinesByGame(ctx.brandKey, rep?.slug ?? 'circuit');
  // Stats are loaded privately; the public sees them once published (the editor's preview sees all).
  const statsMeta = await gameStatsMeta(ctx.brandKey, rep?.slug ?? 'circuit');
  const logoOf = (name: string) => teamRows.find((t) => t.name === name)?.logoUrl ?? null;
  const Team = ({ name, jersey }: { name: string; jersey?: 'Light' | 'Dark' }) => <span className="nm"><TeamLogo url={logoOf(name)} />{name}{jersey && <small>({jersey})</small>}</span>;
  const divs = divisionsOf(games);
  const table = standings(games);
  const season = (() => { const ys = games.map((g) => g.startsAt ? Number(g.startsAt.slice(0, 4)) : 0).filter(Boolean); if (!ys.length) return null; const a = Math.min(...ys), b = Math.max(...ys); return b > a ? `${a}-${String(b).slice(2)}` : String(a); })();
  const nextSeason = season ? `${Number(season.slice(0, 4)) + 1}-${String(Number(season.slice(0, 4)) + 2).slice(2)}` : '2027-28';
  const teams = [...new Set(games.flatMap((g) => [g.home, g.away]))].sort();
  const sel = division && divs.includes(division) ? division : '';
  const shown = sel ? games.filter((g) => g.division === sel) : games;
  // Group games into nights (one date, one division per night on the Circuit).
  const nights: { key: string; iso: string | null; division: string; note: string | null; games: typeof games }[] = [];
  for (const g of shown) {
    const key = `${g.startsAt ? new Date(g.startsAt).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }) : 'tbd'}|${g.division}`;
    let n = nights.find((x) => x.key === key);
    if (!n) { n = { key, iso: g.startsAt, division: g.division, note: g.note, games: [] }; nights.push(n); }
    n.games.push(g);
  }
  const now = Date.now();
  const upcoming = nights.filter((n) => !n.iso || new Date(n.iso).getTime() >= now - 4 * 3600_000);
  const played = nights.filter((n) => n.iso && new Date(n.iso).getTime() < now - 4 * 3600_000).reverse();
  const apply = <ApplyDialog brandKey={ctx.brandKey} siteName={ctx.site.name} season={nextSeason} divisions={divs.length ? divs : ['U13 Boys', 'U14 Boys', 'U15 Boys']} label={`Apply for ${nextSeason}`} />;
  const venueLine = loc?.venue ?? 'Athlete Institute Dome';
  // Day cards (Blue Arrow Classic schedule layout, ALL CAN colours and type):
  // black header bar with the date and game count, a light column-header
  // row, then one row per game: time, game number, home + score, vs,
  // away + score, status pill. Winner's score in red.
  let gameNo = 0;
  const numbered = new Map<number, number>();
  for (const g of games) numbered.set(g.id, ++gameNo);
  const Night = ({ n }: { n: (typeof nights)[number] }) => {
    const [wd, md, yr] = fmtDateStacked(n.iso);
    return (
      <section className="sched-day">
        <div className="sched-head">
          <h3>{n.iso ? `${wd}, ${md}` : 'Date to be confirmed'}{n.iso && <span className="sched-count">{yr.replace(/\.$/, '')}</span>}</h3>
          <span className="sched-div">{n.division || 'All divisions'}{n.note ? ` · ${n.note}` : ''}</span>
        </div>
        <div className="sched-cols" aria-hidden="true"><span /><span /><span>Division</span><span>Home team <b>(Light)</b></span><span /><span>Away team <b>(Dark)</b></span><span /></div>
        {n.games.map((g) => {
          const fin = g.status === 'final' && g.homeScore != null && g.awayScore != null;
          const hw = fin && g.homeScore! > g.awayScore!, aw = fin && g.awayScore! > g.homeScore!;
          const ppd = g.status === 'postponed';
          const hasStats = fin && hasFullStats(stats.get(g.id)) && (ctx.preview || !!statsMeta.get(g.id)?.published);
          const hasScorers = fin && (hasStats || (!!g.scorers && ((g.scorers.home?.length ?? 0) > 0 || (g.scorers.away?.length ?? 0) > 0)));
          // On air from 10 minutes before tip-off until about two hours after.
          const t0 = g.startsAt ? new Date(g.startsAt).getTime() : NaN;
          const live = !fin && Number.isFinite(t0) && now >= t0 - 10 * 60_000 && now <= t0 + 2 * 3600_000;
          const rowInner = (
            <>
              <span className="sched-time">{fmtTime(g.startsAt).replace(' ET', '')}</span>
              <span className="sched-no">Game {numbered.get(g.id)}</span>
              <span className="sched-age">{g.division || '—'}</span>
              <span className="sched-team"><Team name={g.home} jersey="Light" />{fin && <span className={`sc${hw ? ' w' : ''}`}>{g.homeScore}</span>}</span>
              <span className="sched-vs">vs</span>
              <span className="sched-team"><Team name={g.away} jersey="Dark" />{fin && <span className={`sc${aw ? ' w' : ''}`}>{g.awayScore}</span>}</span>
              {!fin && !ppd && g.streamUrl ? (
                <a className={`sched-status sched-live${live ? ' is-live' : ''}`} href={g.streamUrl} target="_blank" rel="noopener" aria-label={`Watch ${g.home} vs ${g.away} live`}>{live && <i className="live-dot" aria-hidden="true" />}{live ? 'Live now' : 'Watch live'}</a>
              ) : (
                <span className={`sched-status${fin ? ' is-final' : ppd ? ' is-ppd' : ''}`}>{fin ? 'Final' : ppd ? 'Postponed' : 'Upcoming'}{hasScorers && <span className="sched-chev" aria-hidden="true">▾</span>}</span>
              )}
            </>
          );
          return hasScorers ? (
            <details key={g.id} className="sched-game">
              <summary className="sched-row" aria-label={`${g.home} ${g.homeScore} – ${g.away} ${g.awayScore}. Top scorers`}>{rowInner}</summary>
              {hasStats
                ? <StatsPreview game={g} lines={stats.get(g.id) ?? []} leaf={`/sites/${ctx.brandKey}/icon-512.png`} players={players} logoOf={logoOf} />
                : <Scorers game={g} leaf={`/sites/${ctx.brandKey}/icon-512.png`} players={players} />}
            </details>
          ) : (
            <div key={g.id} className="sched-row">{rowInner}</div>
          );
        })}
      </section>
    );
  };
  return (
    <>
      <section className="hero hero--photo ink on-dark" style={{ minHeight: 'min(72vh,680px)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="hero-img" src={`/sites/${ctx.brandKey}/photos/circuit-hero.jpg`} alt="Three ALL CAN Circuit players mid-game: a layup, a drive down the lane and a guard surveying the court." />
        <span className="hero-scrim" aria-hidden="true" />
        <div className="wrap"><div className="grid"><div className="left" style={{ gridColumn: '1 / span 8' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/sites/${ctx.brandKey}/logos/circuit-on-dark.png`} alt={`${ctx.site.name.replace(/\s+Sport$/, '')} Circuit`} style={{ width: 'min(320px,80%)', height: 'auto', display: 'block', marginBottom: 28 }} />
          <p className="kicker" style={{ color: 'var(--white)' }}>Rep Basketball League{loc ? ` · ${loc.name}` : ''}</p>
          <div className="lane" aria-hidden="true"><i /><i /><i /></div>
          <h1>Rep your city.<br />Run the Circuit.</h1>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 28 }}>{apply}<a className="pill pill--line" href="#schedule">Schedule and results</a><a className="pill pill--line" href="#standings">Standings</a><a className="pill pill--line" href="#rosters">Rosters</a></div>
        </div></div></div>
      </section>
      <div className="wrap"><nav className="crumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><Link href="/basketball">Basketball</Link><span aria-hidden="true">/</span><span aria-current="page">Circuit</span></nav></div>

      {rep && (
        <Section tight>
          <SecHead label={`${season ? `${season} season` : 'Season'}`} right={<StatusPill label={programStatusLabel(rep).label} live={programStatusLabel(rep).live} />} />
          {/* Facts and team logos fill the left column under the description; the Dome photo sits on the right. */}
          <SplitGrid left={<>
            <h2>Key info.</h2>
            {rep.description && <p className="muted" style={{ marginTop: 12 }}>{rep.description}</p>}
            <dl className="circuit-facts" style={{ marginTop: 24 }}>{rep.facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd><T preview={ctx.preview}>{v}</T></dd></div>)}</dl>
            {teams.length > 0 && <div className="circuit-programs"><p className="circuit-programs-h">Programs</p><div className="circuit-teams">{teams.map((t) => <span key={t}><TeamLogo url={logoOf(t)} small />{t}</span>)}</div></div>}
          </>} right={(() => { const dome = loc?.photos.find((p) => /dome/i.test(p.caption)) ?? null; return dome ? <VenuePhotos photos={[{ ...dome, caption: `${dome.caption} · Home court` }]} single /> : null; })()} />
        </Section>
      )}

      <DevelopmentArm brandKey={ctx.brandKey} />

      <Section id="schedule">
        <SecHead label="Schedule and results" right={divs.length > 1 ? <span className="tabs" style={{ margin: 0 }}><Link href="/circuit#schedule" className="tab" role="button" aria-pressed={!sel}>All</Link>{divs.map((d) => <Link key={d} href={`/circuit?division=${encodeURIComponent(d)}#schedule`} className="tab" role="button" aria-pressed={sel === d}>{d}</Link>)}</span> : undefined} />
        {games.length === 0 ? <p className="muted">The schedule is <T preview={ctx.preview}>[TBC]</T>.</p> : (
          <>
            <p className="muted" style={{ marginBottom: 20 }}>{venueLine}{loc?.address ? ` · ${loc.address}` : ''}. Times ET.</p>
            {upcoming.length > 0 && <div className="sched-list">{upcoming.map((n) => <Night key={n.key} n={n} />)}</div>}
            {played.length > 0 && <><h2 style={{ margin: '48px 0 16px' }}>Results.</h2><div className="sched-list">{played.map((n) => <Night key={n.key} n={n} />)}</div></>}
          </>
        )}
      </Section>

      <Section id="standings" tight>
        <SecHead label="Standings" right={[...stats.keys()].some((id) => ctx.preview || statsMeta.get(id)?.published) ? <Link href="/circuit/stats">Season leaders</Link> : undefined} />
        {table.size === 0 ? <p className="muted">Standings appear once the schedule is set. Wins first, then point difference.</p> : (
          <div className="sched-list">
            {/* Every scheduled team shows from the start, at 0 until its first final score. */}
            {[...table.entries()].sort(([a], [b]) => a.localeCompare(b)).filter(([d]) => !sel || d === sel).map(([div, rows]) => (
              <section key={div} className="sched-day">
                <div className="sched-head"><h3>{div || 'League'}<span className="sched-count">{rows.length} teams</span></h3><span className="sched-div">Wins, then point difference</span></div>
                <div className="stand-cols" aria-hidden="true"><span>#</span><span>Team</span><span>GP</span><span>W</span><span>L</span><span>PF</span><span>PA</span><span>Diff</span></div>
                {rows.map((r, i) => <div key={r.team} className={`stand-row${i === 0 && r.gp > 0 ? ' is-first' : ''}`}><span className="rk">{rows.some((x) => x.gp > 0) ? i + 1 : '–'}</span><Team name={r.team} /><span>{r.gp}</span><span className="w">{r.w}</span><span>{r.l}</span><span>{r.pf}</span><span>{r.pa}</span><span className="df">{r.diff > 0 ? `+${r.diff}` : r.diff}</span></div>)}
              </section>
            ))}
          </div>
        )}
      </Section>

      <Section id="rosters" tight>
        <SecHead label="Rosters" />
        {divs.length === 0 ? <p className="muted">Rosters appear once the schedule is set.</p> : (
          <div className="sched-list">
            {divs.filter((d) => !sel || d === sel).map((div) => {
              const clubs = [...new Set(games.filter((g) => g.division === div).flatMap((g) => [g.home, g.away]))].sort();
              return (
                <section key={div} className="sched-day">
                  <div className="sched-head"><h3>{div || 'League'}<span className="sched-count">{clubs.length} teams</span></h3><span className="sched-div">Open a team to see its roster</span></div>
                  {clubs.map((club) => {
                    const roster = players.filter((p) => p.team === club && p.division === div);
                    return (
                      <details key={club} className="roster">
                        <summary><Team name={club} /><span className="roster-count">{roster.length ? `${roster.length} player${roster.length === 1 ? '' : 's'}` : 'Roster coming'}</span><span className="chev down" aria-hidden="true" /></summary>
                        {roster.length ? (
                          <ol className="roster-list">{roster.map((p) => <li key={p.id}><span className="roster-no">{p.number ? `#${p.number}` : ''}</span><span>{p.name}</span></li>)}</ol>
                        ) : <p className="muted roster-empty">The {club} {div} roster is posted before their first game.</p>}
                      </details>
                    );
                  })}
                </section>
              );
            })}
          </div>
        )}
      </Section>

      <Section>
        <SecHead label={`${nextSeason} season`} />
        <SplitGrid left={<h2>Bring your team.</h2>} right={<><p className="muted" style={{ marginBottom: 16 }}>Applications for the {nextSeason} Circuit are open to rep teams and clubs. Tell us who you are and which divisions you&apos;d enter; we reply to every application.</p>{apply}</>} />
      </Section>
      <BlockRenderer blocks={blocks} ctx={ctx} />
    </>
  );
}

/** Location pages: the venue photo as a full-bleed hero when one is set, otherwise the plain page head. */
function PhotoHead({ loc, ctx, kicker, title, lede, ledeNode, crumbs, titleLogoUrl }: { loc: SiteLocation; ctx: Ctx; kicker: string; title: string; lede: string; ledeNode?: React.ReactNode; crumbs: [string, string][]; /** A logo in place of the title (its alt is the title). */ titleLogoUrl?: string }) {
  if (!loc.photoUrl) return <PageHead kicker={kicker} title={title} lede={lede} crumbs={crumbs} preview={ctx.preview} titleLogoUrl={titleLogoUrl} />;
  return (
    <>
      <section className="hero hero--photo ink on-dark" style={{ minHeight: 'min(62vh,600px)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="hero-img" src={loc.photoUrl} alt={loc.photoAlt ?? `${loc.venue ?? loc.name}`} style={{ objectPosition: '50% 60%' }} />
        <span className="hero-scrim" aria-hidden="true" />
        <div className="wrap"><div className="grid"><div className="left" style={{ gridColumn: '1 / span 8' }}>
          <p className="kicker" style={{ color: 'var(--white)' }}><T preview={ctx.preview}>{kicker}</T></p>
          <div className="lane" aria-hidden="true"><i /><i /><i /></div>
          {titleLogoUrl ? <h1 className="hero-title-logo"><LedeLogo url={titleLogoUrl} name={title.replace(/\.$/, '')} /></h1> : <h1><T preview={ctx.preview}>{title}</T></h1>}
          {ledeNode ? <p className="sub sub--logo">{ledeNode}</p> : lede && <p className="sub"><T preview={ctx.preview}>{lede}</T></p>}
        </div></div></div>
      </section>
      <div className="wrap"><nav className="crumbs" aria-label="Breadcrumb">{crumbs.map(([l, h], i) => <span key={i} style={{ display: 'contents' }}>{i > 0 && <span aria-hidden="true">/</span>}{h ? <Link href={h}>{l}</Link> : <span aria-current="page">{l}</span>}</span>)}</nav></div>
    </>
  );
}

/** Venue photo figures: two across (hub page) or one wide (Circuit key info). */
function VenuePhotos({ photos, single }: { photos: { url: string; alt: string; caption: string }[]; single?: boolean }) {
  return (
    <div className={`venue-photos${single ? ' venue-photos--one' : ''}`}>
      {photos.map((p) => (
        <figure key={p.url} className="venue-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt={p.alt} loading="lazy" />
          <figcaption className="kicker">{p.caption}</figcaption>
        </figure>
      ))}
    </div>
  );
}


/** "ALL CAN Basketball is the development arm of All Canadian Basketball Games, est. 2015." with the All Canadian Games x ALL CAN Basketball lockup, on black. */
function DevelopmentArm({ brandKey }: { brandKey: string }) {
  return (
    <section className="dev-arm on-dark">
      <div className="wrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/sites/${brandKey}/logos/lockup-all-canadian-basketball.png`} alt="All Canadian Games and ALL CAN Basketball" />
        <p>ALL CAN Basketball is the development arm of All&nbsp;Canadian Basketball Games, est.&nbsp;2015.</p>
      </div>
    </section>
  );
}

function LedeLogo({ url, name }: { url: string; name: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="lede-logo" src={url} alt={name} />;
}

function LeaderPhoto({ url, name }: { url: string; name: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={name} loading="lazy" />;
}

/** Safe Sport and NCCP marks (white-on-dark files) on a small black strip. */
function CoachingPartners({ brandKey }: { brandKey: string }) {
  return (
    <div className="coach-partners" aria-label="Coaching partners">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/sites/${brandKey}/partners/safe-sport-training.png`} alt="Safe Sport Training" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/sites/${brandKey}/partners/nccp.png`} alt="National Coaching Certification Program" />
    </div>
  );
}

function TeamLogo({ url, small }: { url: string | null; small?: boolean }) {
  if (!url) return small ? null : <span className="tl tl--none" aria-hidden="true" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={small ? 'tl tl--sm' : 'tl'} src={url} alt="" />;
}

/**
 * Scoring panel under a finished game (owner, Oct 30 2026): top scorers per
 * team, player of the game in bold with the red maple leaf. A native
 * <details> so it needs no JavaScript; the summary IS the game row.
 */
function Scorers({ game, leaf, players }: { game: LeagueGame; leaf: string; players: LeaguePlayer[] }) {
  const sc = game.scorers;
  // Jersey numbers from the roster, when the scorer is rostered.
  const numOf = (team: string, name: string) => players.find((p) => p.team === team && p.division === game.division && p.name.trim().toLowerCase() === name.trim().toLowerCase())?.number ?? null;
  if (!sc || (!sc.home?.length && !sc.away?.length)) return null;
  const col = (team: string, rows: { name: string; pts: number }[]) => (
    <div className="scorers-col">
      <p className="kicker">{team}</p>
      {rows.slice(0, 5).map((r, i) => {
        const potg = !!sc.potg && r.name.trim().toLowerCase() === sc.potg.trim().toLowerCase();
        return (
          <div key={i} className={`scorer${potg ? ' is-potg' : ''}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <span className="scorer-nm">{potg && <img src={leaf} alt="Player of the game" className="leaf" />}{numOf(team, r.name) && <span className="scorer-no">#{numOf(team, r.name)}</span>}{r.name}</span>
            <span className="scorer-pts">{r.pts}</span>
          </div>
        );
      })}
    </div>
  );
  return (
    <div className="scorers">
      {col(game.home, sc.home ?? [])}
      {col(game.away, sc.away ?? [])}
      {sc.potg && <p className="scorers-potg"><span className="kicker">Player of the game</span> <b>{sc.potg}</b></p>}
    </div>
  );
}

/** A player's label: roster or uploaded name, with the jersey number. */
function playerLabel(l: StatLine, game: LeagueGame, players: LeaguePlayer[]): { no: string | null; name: string } {
  const rost = players.find((p) => p.team === l.team && p.division === game.division && ((l.number && String(p.number ?? '').replace(/^#/, '') === l.number) || (l.name && p.name.trim().toLowerCase() === l.name.trim().toLowerCase())));
  return { no: l.number, name: l.name ?? rost?.name ?? '' };
}
const isPotg = (l: StatLine, label: { no: string | null; name: string }, potg: string | null | undefined) => {
  if (!potg) return false;
  const p = potg.trim().toLowerCase().replace(/^#/, '');
  return (!!label.name && label.name.trim().toLowerCase() === p) || (!!l.number && l.number === p);
};

/**
 * Schedule expand, once full stats are uploaded: the top five stat lines per
 * team (points, then rebounds, then assists), player of the game with the
 * leaf, and the Full stats button.
 */
function StatsPreview({ game, lines, leaf, players, logoOf }: { game: LeagueGame; lines: StatLine[]; leaf: string; players: LeaguePlayer[]; logoOf: (team: string) => string | null }) {
  const boxes = boxesFor(lines, game.home, game.away);
  const potg = game.scorers?.potg ?? null;
  const col = (b: TeamBox) => {
    const tot = teamTotals(b.lines, b.total);
    return (
      <div className="scorers-col" key={b.team}>
        <p className="kicker sp-team"><TeamLogo url={logoOf(b.team)} small />{b.team}</p>
        {b.lines.length > 0 ? (
          <table className="sp-table">
            <thead><tr><th scope="col">Player</th><th scope="col" className="num">PTS</th><th scope="col" className="num">REB</th><th scope="col" className="num">AST</th></tr></thead>
            <tbody>{topLines(b.lines).map((l) => {
              const lab = playerLabel(l, game, players); const star = isPotg(l, lab, potg);
              return (
                <tr key={l.id} className={star ? 'is-potg' : undefined}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <td><Link className="scorer-nm" href={playerHref(game.division, l.team, l.number, l.name)}>{star && <img src={leaf} alt="Player of the game" className="leaf" />}{lab.no && <span className="scorer-no">#{lab.no}</span>}{lab.name}</Link></td>
                  <td className="num"><b>{l.pts}</b></td><td className="num">{l.reb}</td><td className="num">{l.ast}</td>
                </tr>
              );
            })}</tbody>
          </table>
        ) : <p className="muted sp-none">Player stats not uploaded.</p>}
        {tot && <p className="sp-tot">Team · <b>{tot.pts}</b> PTS · {tot.reb} REB · {tot.ast} AST{tot.fga ? ` · FG ${tot.fgm}-${tot.fga}` : ''}</p>}
      </div>
    );
  };
  return (
    <div className="scorers">
      {boxes.map(col)}
      <div className="sp-foot">
        {potg ? <p className="scorers-potg"><span className="kicker">Player of the game</span> <b>{potg}</b></p> : lines.some((l) => l.source === 'superstat') ? <a className="note" href="https://superstatsport.com" target="_blank" rel="noopener">Powered by Superstat</a> : <span />}
        <Link className="pill pill--ink pill--sm" href={`/circuit/games/${game.id}`}>Full stats</Link>
      </div>
    </div>
  );
}

/**
 * /circuit/games/<id>: the full box score for one game, in the Circuit's
 * day-card style. Only exists once stats are uploaded (404 before), and is
 * kept out of search (youth players).
 */
async function LeagueGamePage({ ctx, gameId }: { ctx: Ctx; gameId: number }) {
  const rep = (await listPrograms(ctx.brandKey)).find((p) => p.leagueType === 'Rep' || p.slug === 'circuit');
  const slug = rep?.slug ?? 'circuit';
  const games = await listGames(ctx.brandKey, slug);
  const game = games.find((g) => g.id === gameId);
  if (!game) notFound();
  const lines = await gameStatLines(ctx.brandKey, game.id);
  if (!hasFullStats(lines)) notFound();
  if (!ctx.preview && !(await gameStatsMeta(ctx.brandKey, slug)).get(game.id)?.published) notFound();
  const fromSuperstat = lines.some((l) => l.source === 'superstat');
  const events = await gameEvents(ctx.brandKey, game.id);
  const reelsUrl = (await reelsUrls(ctx.brandKey, game.leagueSlug)).get(game.id) ?? null;
  const shotsOf = (team: string) => events.filter((e) => e.team === team && (e.type === 'two_point' || e.type === 'three_point') && e.x != null && e.y != null);
  const [teamRows, players] = await Promise.all([listTeams(ctx.brandKey, slug), listPlayers(ctx.brandKey, slug)]);
  const logoOf = (name: string) => teamRows.find((t) => t.name === name)?.logoUrl ?? null;
  const no = games.findIndex((g) => g.id === game.id) + 1;
  const boxes = boxesFor(lines, game.home, game.away);
  const [wd, md, yr] = fmtDateStacked(game.startsAt);
  const potg = game.scorers?.potg ?? null;
  const leaf = `/sites/${ctx.brandKey}/icon-512.png`;
  const fin = game.homeScore != null && game.awayScore != null;
  const shoot = (m: number | null, a: number | null) => (m == null || a == null ? '–' : `${m}-${a}`);
  const has = (b: TeamBox, k: keyof StatLine) => b.lines.some((l) => l[k] != null) || (b.total?.[k] ?? null) != null;
  const Box = ({ b, score, won }: { b: TeamBox; score: number | null; won: boolean }) => {
    const tot = teamTotals(b.lines, b.total) as StatLine | null;
    const cols: [keyof StatLine, string][] = (([['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['stl', 'STL'], ['blk', 'BLK'], ['tov', 'TO'], ['pf', 'PF']] as [keyof StatLine, string][]).filter(([k]) => k === 'pts' || k === 'reb' || k === 'ast' || has(b, k)));
    const shots = ([['fgm', 'fga', 'FG'], ['tpm', 'tpa', '3PT'], ['ftm', 'fta', 'FT']] as [keyof StatLine, keyof StatLine, string][]).filter(([m]) => has(b, m));
    return (
      <section className="sched-day box">
        <div className="sched-head box-head"><h3><TeamLogo url={logoOf(b.team)} /><Link href={teamHref(game.division, b.team)} className="box-teamlink">{b.team}</Link></h3>{score != null && <span className={`box-score${won ? ' w' : ''}`}>{score}</span>}</div>
        {tot && <p className="box-sum">{([tot.fga != null && `FG ${tot.fgm}-${tot.fga}${pct(tot.fgm, tot.fga) != null ? ` (${pct(tot.fgm, tot.fga)}%)` : ''}`, tot.tpa != null && `3PT ${tot.tpm}-${tot.tpa}${pct(tot.tpm, tot.tpa) != null ? ` (${pct(tot.tpm, tot.tpa)}%)` : ''}`, tot.fta != null && `FT ${tot.ftm}-${tot.fta}${pct(tot.ftm, tot.fta) != null ? ` (${pct(tot.ftm, tot.fta)}%)` : ''}`, `${tot.reb} REB`, `${tot.ast} AST`, tot.stl != null && `${tot.stl} STL`, tot.blk != null && `${tot.blk} BLK`, tot.tov != null && `${tot.tov} TO`].filter(Boolean) as string[]).map((t, k) => <span key={k} className="bs-item">{t}</span>)}</p>}
        {b.lines.length > 0 ? (
          <div className="tbl-wrap">
            <table className="box-table">
              <thead><tr><th scope="col">Player</th>{cols.map(([, l]) => <th key={l} scope="col" className="num">{l}</th>)}{shots.map(([, , l]) => <th key={l} scope="col" className="num">{l}</th>)}</tr></thead>
              <tbody>
                {b.lines.map((l) => {
                  const lab = playerLabel(l, game, players); const star = isPotg(l, lab, potg);
                  return (
                    <tr key={l.id} className={star ? 'is-potg' : undefined}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <td className="team"><Link className="scorer-nm" href={playerHref(game.division, l.team, l.number, l.name)}>{star && <img src={leaf} alt="Player of the game" className="leaf" />}{lab.no && <span className="scorer-no">#{lab.no}</span>}{lab.name}</Link></td>
                      {cols.map(([k, lb]) => <td key={lb} className="num">{k === 'pts' ? <b>{l.pts}</b> : (l[k] as number | null) ?? '–'}</td>)}
                      {shots.map(([m, a, lb]) => <td key={lb} className="num">{shoot(l[m] as number | null, l[a] as number | null)}</td>)}
                    </tr>
                  );
                })}
              </tbody>
              {tot && <tfoot><tr><th scope="row">Team</th>{cols.map(([k, lb]) => <td key={lb} className="num">{(tot[k] as number | null) ?? '–'}</td>)}{shots.map(([m, a, lb]) => <td key={lb} className="num">{shoot(tot[m] as number | null, tot[a] as number | null)}</td>)}</tr></tfoot>}
            </table>
          </div>
        ) : <p className="muted box-none">Player stats weren&apos;t uploaded for this team.</p>}
      </section>
    );
  };
  return (
    <>
      <div className="wrap"><Crumbs items={[['Home', '/'], ['Circuit', '/circuit'], [`Game ${no}`, '']]} /></div>
      <section className="sec" style={{ paddingTop: 24 }}><div className="wrap">
        <div className="sched-day game-card">
          <div className="sched-head"><h3>{game.startsAt ? `${wd}, ${md}` : 'Date to be confirmed'}{game.startsAt && <span className="sched-count">{yr.replace(/\.$/, '')}</span>}</h3><span className="sched-div">Game {no} · {game.division}{game.note ? ` · ${game.note}` : ''}</span></div>
          <div className="game-line">
            <span className="gl-team"><TeamLogo url={logoOf(game.home)} />{game.home}<small>Home</small></span>
            <span className={`gl-sc${fin && game.homeScore! > game.awayScore! ? ' w' : ''}`}>{game.homeScore ?? '–'}</span>
            <span className="sched-status is-final">Final</span>
            <span className={`gl-sc${fin && game.awayScore! > game.homeScore! ? ' w' : ''}`}>{game.awayScore ?? '–'}</span>
            <span className="gl-team gl-away"><TeamLogo url={logoOf(game.away)} />{game.away}<small>Away</small></span>
          </div>
          {potg && (
            <p className="gl-potg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={leaf} alt="" className="leaf" />
              <span className="kicker">Player of the game</span> <b>{potg}</b>
            </p>
          )}
        </div>
        <div className="sched-list" style={{ marginTop: 28 }}>
          <Box b={boxes[0]} score={game.homeScore} won={fin && game.homeScore! > game.awayScore!} />
          <Box b={boxes[1]} score={game.awayScore} won={fin && game.awayScore! > game.homeScore!} />
        </div>
        {(shotsOf(game.home).length > 0 || shotsOf(game.away).length > 0) && (
          <section className="sched-day" style={{ marginTop: 28 }}>
            <div className="sched-head"><h3>Shot maps</h3></div>
            <div className="chart-pad chart-pair"><ShotChart shots={shotsOf(game.home)} label={game.home} /><ShotChart shots={shotsOf(game.away)} label={game.away} /></div>
          </section>
        )}
        {fromSuperstat && <p className="note" style={{ marginTop: 20 }}><a href="https://superstatsport.com" target="_blank" rel="noopener">Powered by Superstat</a></p>}
        <p style={{ marginTop: 28, display: 'flex', gap: 10, flexWrap: 'wrap' }}>{reelsUrl && <a className="pill pill--red pill--sm" href={reelsUrl}>Get the highlight reel</a>}<Link className="pill pill--line pill--sm" href="/circuit#schedule">Back to the schedule</Link><Link className="pill pill--line pill--sm" href={`/circuit/stats?division=${encodeURIComponent(game.division)}`}>Season leaders</Link></p>
        {reelsUrl && <p className="note" style={{ marginTop: 10 }}>Highlight reels are cut from this game&apos;s plays: a player reel is $10, a team reel is $20. You buy and download them in your Athlete Institute Live account.</p>}
      </div></section>
    </>
  );
}

async function About({ ctx, page }: { ctx: Ctx; page: SitePage | null }) {
  const blocks = page ? (ctx.preview ? page.blocksDraft : page.blocksPublished ?? []) : [];
  // The home page's tagline and Why band, so About always says the same thing.
  const home = await getPageBySlug(ctx.brandKey, '');
  const homeBlocks = home ? (ctx.preview ? home.blocksDraft : home.blocksPublished ?? []) : [];
  const hero = homeBlocks.find((b) => b.type === 'hero' && !b.hidden);
  const lines = ((hero?.props.headingLines as string[] | undefined) ?? []).filter(Boolean);
  const accent = typeof hero?.props.accentWord === 'string' ? hero.props.accentWord : '';
  const why = homeBlocks.find((b) => b.type === 'why_band' && !b.hidden);
  return (
    <>
      <PageHead kicker="About" title={`${ctx.site.name}.`} titleLogoUrl={`/sites/${ctx.brandKey}/logos/sport-horizontal-on-white.png`} lede={lines.length ? null : ctx.site.seo.default_description} crumbs={[['Home', '/'], ['About', '']]}>
        {lines.length > 0 && <p className="about-tagline">{lines.map((l, i) => <span key={i}>{accent && l.startsWith(accent) ? <><span className="tag-red">{accent}</span>{l.slice(accent.length)}</> : l}</span>)}</p>}
      </PageHead>
      {why && <BlockRenderer blocks={[{ ...why, props: { ...why.props, showSports: false } }]} ctx={ctx} />}
      <Section tight><SecHead label="Structure" /><h2 className="lp-h2">One name.<br />{SPORTS.length} sports.</h2><SportTiles /></Section>
      <BlockRenderer blocks={blocks} ctx={ctx} />
      <Section id="contact"><SecHead label="Contact" /><SplitGrid left={<h2>Talk to us.</h2>} right={<>
        <FactsDl preview={ctx.preview} facts={[['Email', ctx.site.contact.email ?? '[TBC]'], ['Phone', ctx.site.contact.phone ?? '[TBC]']]} />
        <div style={{ marginTop: 24 }}><LeadForm brandKey={ctx.brandKey} variant="contact" context="About · Talk to us" siteName={ctx.site.name} /></div>
      </>} /></Section>
    </>
  );
}

function PrivacyPolicy({ ctx, page }: { ctx: Ctx; page: SitePage | null }) {
  const blocks = page ? (ctx.preview ? page.blocksDraft : page.blocksPublished ?? []) : [];
  const legal = ctx.site.contact.legal_name ?? ctx.site.name;
  const sections = PRIVACY_POLICY.sections.map((s) => ({ ...s, html: s.html.replace(/Athlete Institute, Ltd\./g, legal).replace(/info@athleteinstitute\.ca/g, ctx.site.contact.email ?? 'info@athleteinstitute.ca').replace(/519-940-3735/g, ctx.site.contact.phone ?? '519-940-3735').replace(/ALL CAN Sport/g, ctx.site.name) }));
  return (
    <>
      <PageHead kicker="Policies" title="Privacy policy." lede={`How ${ctx.site.name} collects, uses and protects personal information.`} crumbs={[['Home', '/'], ['Privacy policy', '']]} />
      {blocks.length > 0 ? <BlockRenderer blocks={blocks} ctx={ctx} /> : (
        <section className="sec" style={{ paddingTop: 40 }}><div className="wrap"><div className="grid pp">
          <div className="left pp-side">
            <FactsDl facts={[['Operator', `${legal}. ${ctx.site.name} is a division.`], ['Applies to', `${ctx.site.primaryHost ?? ctx.site.name} and every ${ctx.site.name} program`], ['Effective', PRIVACY_POLICY.effective]]} />
            <nav aria-label="On this page" className="pp-toc"><p className="label">On this page</p>{sections.map((s) => <a key={s.id} href={`#pp-${s.id}`}>{s.heading}</a>)}</nav>
          </div>
          <div className="right pp-body">{sections.map((s) => <section key={s.id} id={`pp-${s.id}`} aria-labelledby={`pp-${s.id}-h`}><h2 id={`pp-${s.id}-h`}>{s.heading}.</h2><div className="rich" dangerouslySetInnerHTML={{ __html: s.html.replace(/\[TBC\]/g, `<em class="tbc">${ctx.preview ? '[TBC]' : 'To be confirmed'}</em>`) }} /></section>)}</div>
        </div></div></section>
      )}
    </>
  );
}

export { SportTiles, programStatusLabel, getProgram, upcomingGames };
