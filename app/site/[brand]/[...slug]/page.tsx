import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import BlockRenderer, { SportTiles } from '@/components/site/blocks/BlockRenderer';
import ProgramBlock from '@/components/site/ProgramBlock';
import LeadForm from '@/components/site/LeadForm';
import ApplyDialog from '@/components/site/ApplyDialog';
import { fmtDateStacked, fmtTime } from '@/lib/site/context';
import { divisionsOf, listGames, listTeams, standings, type LeagueGame } from '@/lib/site/league';
import { Chev, FactsDl, PageHead, Row, SecHead, Section, SplitGrid, StatusPill, T } from '@/components/site/ui';
import { GameCard } from '@/components/compete/DivisionPage';
import { siteContext, type SiteContext } from '@/lib/site/context';
import { getPageBySlug, listPages, type SitePage } from '@/lib/site/pages';
import { getLocation, getProgram, listLocations, listPrograms, locationStatusLabel, programStatusLabel, SPORTS, sportBySlug, type SiteLocation } from '@/lib/site/records';
import { pageDescription, pageTitle, breadcrumbJsonLd } from '@/lib/site/seo';
import { PRIVACY_POLICY } from '@/lib/site/privacy-policy';
import { listDivisions, recentResults, upcomingGames } from '@/lib/compete/compete';
import type { Block } from '@/lib/site/blocks';

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
  // Location/sport pages without a page row still get a formatted title.
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
          <Section tight><SplitGrid left={<><h2>Be first<br />to know.</h2><p className="muted" style={{ marginTop: 12 }}>Locations and dates are <T preview={ctx.preview}>[TBC]</T>.</p></>} right={<LeadForm brandKey={ctx.site.brandKey} variant="interest" context={sport.name} siteName={ctx.site.name} />} /></Section>
          <Section><SecHead label="Request near you" /><SplitGrid left={<h2>Bring {sport.name.toLowerCase()}<br />to your area.</h2>} right={<LeadForm brandKey={ctx.site.brandKey} variant="location" initialSport={sport.slug} siteName={ctx.site.name} />} /></Section>
          <BlockRenderer blocks={blocks(page)} ctx={rctx} />
        </>
      );
    }
    case 'circuit': return <Circuit ctx={rctx} page={page} division={searchParams.division} />;
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
  return 'missing';
}

// ---------------------------------------------------------------------------

async function LocationsFinder({ ctx, page, sport }: { ctx: Ctx; page: SitePage | null; sport?: string }) {
  const locs = await listLocations(ctx.brandKey);
  const cities = [...new Set(locs.map((l) => l.city ?? l.name))];
  const blocks = page ? (ctx.preview ? page.blocksDraft : page.blocksPublished ?? []) : [];
  return (
    <>
      <PageHead kicker="Locations" title="Locations." lede="Pick a location to see its programs, venue details and schedule." crumbs={[['Home', '/'], ['Locations', '']]} />
      <Section tight><SplitGrid left={<span className="label">By city</span>} right={<>
        {cities.map((c) => (
          <div key={c}>
            <h3 style={{ margin: '8px 0 10px' }}>{c}.</h3>
            <div className="rows">
              {locs.filter((l) => (l.city ?? l.name) === c).map((l) => { const st = locationStatusLabel(l); return <Row key={l.slug} href={`/${l.slug}`} title={l.name} meta={<>{l.venue}{l.address ? ` · ${l.address}` : ''}<br />{l.sports.map((s) => sportBySlug(s)?.name ?? s).join(', ')}</>} end={<StatusPill label={st.label} live={st.live} />} />; })}
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
            <p className="muted" style={{ marginTop: 14 }}>Families can ask for a new location. Schools, community centres and facilities can host a program.</p>
            <div id="host" style={{ marginTop: 36 }}>
              <h3 style={{ marginBottom: 12 }}>Hosting a program.</h3>
              <FactsDl preview={ctx.preview} facts={[['You provide', 'Gym time at your school or facility, and a court that suits the program.'], ['We provide', 'Coaching, the program plan, registration and scheduling [TBC].'], ['Sports', 'Basketball now. Volleyball, soccer and flag football as they launch.'], ['Insurance', '[TBC]'], ['Rental or revenue terms', '[TBC]'], ['Next step', 'We reply within [TBC] business days to set up a call and a site visit.']]} />
            </div>
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
      <PhotoHead loc={loc} ctx={ctx} kicker={`${loc.city ?? loc.region} · ${st.label}`} title={`${loc.name}.`} lede={progs.length ? `${progs.map((p) => p.name).join(' and ')} at ${loc.venue ?? loc.name}.` : loc.note ?? ''} crumbs={[['Home', '/'], ['Locations', '/locations'], [loc.name, '']]} />
      <Section tight><SecHead label="Venue" /><SplitGrid
        left={<><h2>{loc.venue ?? loc.name}.</h2>{loc.address && <p className="muted" style={{ marginTop: 12 }}>{loc.address}</p>}{loc.note && <p className="note" style={{ marginTop: 8 }}><T preview={ctx.preview}>{loc.note}</T></p>}</>}
        right={<FactsDl preview={ctx.preview} facts={[['Address', loc.address ?? '[TBC]'], ['Parking', loc.parking ?? '[TBC]'], ['Arrival', loc.arrival ?? '[TBC]'], ['Contact', loc.contact ?? ctx.site.contact.email ?? '[TBC]'], ['Local updates', loc.socialUrl ?? '[TBC]']]} />}
      /></Section>
      <Section><SecHead label="Sports here" /><div className="rows">
        {loc.sports.map((s) => { const sp = sportBySlug(s); const here = progs.filter((p) => p.sport === s); return <Row key={s} href={`/${loc.slug}/${s}`} title={sp?.name ?? s} meta={here.map((p) => p.name).join(' · ')} end={<StatusPill label={st.label} live={st.live} />} />; })}
        {SPORTS.filter((s) => !loc.sports.includes(s.slug)).map((s) => <Row key={s.slug} title={s.name} muted meta="Not offered here yet." end={<span className="status">Coming soon</span>} />)}
      </div></Section>
      <Section><SecHead label="Season calendar" /><SplitGrid left={<h2>Key dates.</h2>} right={<FactsDl preview={ctx.preview} facts={loc.calendar.length ? loc.calendar : [['Registration opens', '[TBC]'], ['Placement', '[TBC]'], ['Jerseys', '[TBC]'], ['First session', '[TBC]'], ['Last session', '[TBC]']]} />} /></Section>
      <Section><SecHead label="Coaches" /><SplitGrid left={<h2>Who coaches<br />here.</h2>} right={<p className="muted">Coach profiles for {loc.name} are <T preview={ctx.preview}>[TBC]</T>. Every coach is screened before working with players.</p>} /></Section>
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
  return (
    <>
      <PhotoHead loc={loc} ctx={ctx} kicker={`${loc.name} · ${sport.name}`} title={`${sport.name} in ${loc.name}.`} lede={`Every ${sport.name.toLowerCase()} program at ${loc.venue ?? loc.name}.`} crumbs={[['Home', '/'], ['Locations', '/locations'], [loc.name, `/${loc.slug}`], [sport.name, '']]} />
      <Section tight><SecHead label="Programs" right={<span className="note">{progs.length} program{progs.length === 1 ? '' : 's'}</span>} />
        {progs.map((p, i) => <ProgramBlock key={p.id} program={p} location={loc} ctx={ctx} primary={i === 0} />)}
        {progs.length === 0 && <p className="muted">No programs published here yet.</p>}
      </Section>
      {faq.length > 0 && <Section><SecHead label="Before you register" /><SplitGrid left={<h2>Good to know.</h2>} right={<div className="acc">{faq.map((f, i) => <details key={i}><summary>{f.q}<span className="chev down" aria-hidden="true" /></summary><div className="body"><p><T preview={ctx.preview}>{f.a}</T></p>{f.note && <p className="muted"><T preview={ctx.preview}>{f.note}</T></p>}</div></details>)}</div>} /></Section>}
      <BlockRenderer blocks={blocks} ctx={ctx} />
    </>
  );
}

async function SportOverview({ ctx, sport, page }: { ctx: Ctx; sport: NonNullable<ReturnType<typeof sportBySlug>>; page: SitePage | null }) {
  const [locs, progs] = await Promise.all([listLocations(ctx.brandKey), listPrograms(ctx.brandKey, { sport: sport.slug })]);
  const blocks = page ? (ctx.preview ? page.blocksDraft : page.blocksPublished ?? []) : [];
  const pathway = [...progs].sort((a, b) => ['Youth Skills', 'Youth League', 'Adult League', 'Rep'].indexOf(a.leagueType) - ['Youth Skills', 'Youth League', 'Adult League', 'Rep'].indexOf(b.leagueType));
  return (
    <>
      <PageHead kicker="Sport" title={`${sport.name}.`} lede={`${pathway.length} ways to play: ${pathway.map((p) => p.leagueType.toLowerCase()).join(', ')}.`} crumbs={[['Home', '/'], [sport.name, '']]} />
      <Section tight><SecHead label="Pathway" /><SplitGrid left={<h2>Where every<br />player fits.</h2>} right={<div className="rows">
        {pathway.map((p) => { const l = locs.find((x) => x.slug === p.locationSlug); return <Link key={p.id} className="row" href={p.leagueType === 'Rep' ? '/circuit' : `/${p.locationSlug}/${sport.slug}#${p.slug}`}><div><p className="kicker muted">{p.leagueType}</p><h3 style={{ marginTop: 4 }}>{p.name}</h3></div><span className="meta">{l?.name ?? p.locationSlug}{p.description ? ` · ${p.description}` : ''}</span><span className="end"><Chev /></span></Link>; })}
      </div>} /></Section>
      <Section><SecHead label="Where to play" /><div className="rows">
        {locs.filter((l) => l.sports.includes(sport.slug)).map((l) => { const st = locationStatusLabel(l); return <Row key={l.slug} href={`/${l.slug}/${sport.slug}`} title={l.name} meta={progs.filter((p) => p.locationSlug === l.slug).map((p) => p.name).join(' · ')} end={<StatusPill label={st.label} live={st.live} />} />; })}
      </div></Section>
      <BlockRenderer blocks={blocks} ctx={ctx} />
    </>
  );
}

async function Circuit({ ctx, page, division }: { ctx: Ctx; page: SitePage | null; division?: string }) {
  const rep = (await listPrograms(ctx.brandKey)).find((p) => p.leagueType === 'Rep' || p.slug === 'circuit');
  const loc = rep ? await getLocation(ctx.brandKey, rep.locationSlug) : null;
  const blocks = page ? (ctx.preview ? page.blocksDraft : page.blocksPublished ?? []) : [];
  const games = await listGames(ctx.brandKey, rep?.slug ?? 'circuit');
  const teamRows = await listTeams(ctx.brandKey, rep?.slug ?? 'circuit');
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
          <h3>{n.iso ? `${wd}, ${md}` : 'Date to be confirmed'}<span className="sched-count">{n.games.length} game{n.games.length === 1 ? '' : 's'}{n.iso ? ` · ${yr}` : ''}</span></h3>
          <span className="sched-div">{n.division || 'All divisions'}{n.note ? ` · ${n.note}` : ''}</span>
        </div>
        <div className="sched-cols" aria-hidden="true"><span /><span /><span>Division</span><span>Home team <b>(Light)</b></span><span /><span>Away team <b>(Dark)</b></span><span /></div>
        {n.games.map((g) => {
          const fin = g.status === 'final' && g.homeScore != null && g.awayScore != null;
          const hw = fin && g.homeScore! > g.awayScore!, aw = fin && g.awayScore! > g.homeScore!;
          const ppd = g.status === 'postponed';
          const hasScorers = fin && !!g.scorers && ((g.scorers.home?.length ?? 0) > 0 || (g.scorers.away?.length ?? 0) > 0);
          const rowInner = (
            <>
              <span className="sched-time">{fmtTime(g.startsAt).replace(' ET', '')}</span>
              <span className="sched-no">Game {numbered.get(g.id)}</span>
              <span className="sched-age">{g.division || '—'}</span>
              <span className="sched-team"><Team name={g.home} jersey="Light" />{fin && <span className={`sc${hw ? ' w' : ''}`}>{g.homeScore}</span>}</span>
              <span className="sched-vs">vs</span>
              <span className="sched-team"><Team name={g.away} jersey="Dark" />{fin && <span className={`sc${aw ? ' w' : ''}`}>{g.awayScore}</span>}</span>
              <span className={`sched-status${fin ? ' is-final' : ppd ? ' is-ppd' : ''}`}>{fin ? 'Final' : ppd ? 'Postponed' : 'Upcoming'}{hasScorers && <span className="sched-chev" aria-hidden="true">▾</span>}</span>
            </>
          );
          return hasScorers ? (
            <details key={g.id} className="sched-game">
              <summary className="sched-row" aria-label={`${g.home} ${g.homeScore} – ${g.away} ${g.awayScore}. Top scorers`}>{rowInner}</summary>
              <Scorers game={g} leaf={`/sites/${ctx.brandKey}/icon-512.png`} />
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
        <span className="vcredit">Photo <T preview={ctx.preview}>[TBC]</T></span>
        <div className="wrap"><div className="grid"><div className="left" style={{ gridColumn: '1 / span 8' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/sites/${ctx.brandKey}/logos/circuit-on-dark.png`} alt={`${ctx.site.name.replace(/\s+Sport$/, '')} Circuit`} style={{ width: 'min(320px,80%)', height: 'auto', display: 'block', marginBottom: 28 }} />
          <p className="kicker" style={{ color: 'var(--white)' }}>Rep Basketball League{loc ? ` · ${loc.name}` : ''}</p>
          <div className="lane" aria-hidden="true"><i /><i /><i /></div>
          <h1>Rep your city.<br />Run the Circuit.</h1>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 28 }}>{apply}<a className="pill pill--line" href="#schedule">Schedule and results</a><a className="pill pill--line" href="#standings">Standings</a></div>
        </div></div></div>
      </section>
      <div className="wrap"><nav className="crumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><Link href="/basketball">Basketball</Link><span aria-hidden="true">/</span><span aria-current="page">Circuit</span></nav></div>

      {rep && (
        <Section tight>
          <SecHead label={`${season ? `${season} season` : 'Season'}`} right={<StatusPill label={programStatusLabel(rep).label} live={programStatusLabel(rep).live} />} />
          <SplitGrid left={<><h2>Key info.</h2>{rep.description && <p className="muted" style={{ marginTop: 12 }}>{rep.description}</p>}</>} right={<>
            <dl className="circuit-facts">{rep.facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd><T preview={ctx.preview}>{v}</T></dd></div>)}</dl>
            {teams.length > 0 && <div style={{ marginTop: 24 }}><p className="kicker" style={{ marginBottom: 8 }}>Teams</p><div className="circuit-teams">{teams.map((t) => <span key={t}><TeamLogo url={logoOf(t)} small />{t}</span>)}</div></div>}
          </>} />
        </Section>
      )}

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
        <SecHead label="Standings" />
        {table.size === 0 || [...table.values()].every((rows) => rows.every((r) => r.gp === 0)) ? <p className="muted">Standings appear after the first final score. Wins first, then point difference.</p> : (
          <div className="sched-list">
            {[...table.entries()].filter(([d]) => !sel || d === sel).map(([div, rows]) => (
              <section key={div} className="sched-day">
                <div className="sched-head"><h3>{div || 'League'}<span className="sched-count">{rows.length} teams</span></h3><span className="sched-div">Wins, then point difference</span></div>
                <div className="stand-cols" aria-hidden="true"><span>#</span><span>Team</span><span>GP</span><span>W</span><span>L</span><span>PF</span><span>PA</span><span>Diff</span></div>
                {rows.map((r, i) => <div key={r.team} className={`stand-row${i === 0 && r.gp > 0 ? ' is-first' : ''}`}><span className="rk">{i + 1}</span><Team name={r.team} /><span>{r.gp}</span><span className="w">{r.w}</span><span>{r.l}</span><span>{r.pf}</span><span>{r.pa}</span><span className="df">{r.diff > 0 ? `+${r.diff}` : r.diff}</span></div>)}
              </section>
            ))}
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
function PhotoHead({ loc, ctx, kicker, title, lede, crumbs }: { loc: SiteLocation; ctx: Ctx; kicker: string; title: string; lede: string; crumbs: [string, string][] }) {
  if (!loc.photoUrl) return <PageHead kicker={kicker} title={title} lede={lede} crumbs={crumbs} preview={ctx.preview} />;
  return (
    <>
      <section className="hero hero--photo ink on-dark" style={{ minHeight: 'min(62vh,600px)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="hero-img" src={loc.photoUrl} alt={loc.photoAlt ?? `${loc.venue ?? loc.name}`} style={{ objectPosition: '50% 60%' }} />
        <span className="hero-scrim" aria-hidden="true" />
        <div className="wrap"><div className="grid"><div className="left" style={{ gridColumn: '1 / span 8' }}>
          <p className="kicker" style={{ color: 'var(--white)' }}><T preview={ctx.preview}>{kicker}</T></p>
          <div className="lane" aria-hidden="true"><i /><i /><i /></div>
          <h1><T preview={ctx.preview}>{title}</T></h1>
          {lede && <p className="sub"><T preview={ctx.preview}>{lede}</T></p>}
        </div></div></div>
      </section>
      <div className="wrap"><nav className="crumbs" aria-label="Breadcrumb">{crumbs.map(([l, h], i) => <span key={i} style={{ display: 'contents' }}>{i > 0 && <span aria-hidden="true">/</span>}{h ? <Link href={h}>{l}</Link> : <span aria-current="page">{l}</span>}</span>)}</nav></div>
    </>
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
function Scorers({ game, leaf }: { game: LeagueGame; leaf: string }) {
  const sc = game.scorers;
  if (!sc || (!sc.home?.length && !sc.away?.length)) return null;
  const col = (team: string, rows: { name: string; pts: number }[]) => (
    <div className="scorers-col">
      <p className="kicker">{team}</p>
      {rows.slice(0, 5).map((r, i) => {
        const potg = !!sc.potg && r.name.trim().toLowerCase() === sc.potg.trim().toLowerCase();
        return (
          <div key={i} className={`scorer${potg ? ' is-potg' : ''}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <span className="scorer-nm">{potg && <img src={leaf} alt="Player of the game" className="leaf" />}{r.name}</span>
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

async function About({ ctx, page }: { ctx: Ctx; page: SitePage | null }) {
  const blocks = page ? (ctx.preview ? page.blocksDraft : page.blocksPublished ?? []) : [];
  return (
    <>
      <PageHead kicker="About" title={`${ctx.site.name}.`} lede={ctx.site.seo.default_description} crumbs={[['Home', '/'], ['About', '']]} />
      <Section tight><SecHead label="Structure" /><SplitGrid left={<h2>One name.<br />{SPORTS.length} sports.</h2>} right={<div className="rows">
        {SPORTS.map((s) => <div key={s.slug} className="row" style={{ gridTemplateColumns: 'minmax(0,.7fr) minmax(0,1.6fr) auto' }}><h3>{s.name}</h3><span className="meta">{s.programs.map((l) => l[0]).join(' · ')}</span><span className="end">{s.status === 'live' ? <span className="status status--live">Now playing</span> : <span className="status">Coming soon</span>}</span></div>)}
      </div>} /></Section>
      <BlockRenderer blocks={blocks} ctx={ctx} />
      <Section id="contact"><SecHead label="Contact" /><SplitGrid left={<h2>Talk to us.</h2>} right={<>
        <FactsDl preview={ctx.preview} facts={[['Email', ctx.site.contact.email ?? '[TBC]'], ['Phone', ctx.site.contact.phone ?? '[TBC]']]} />
        <p className="note" style={{ marginTop: 12 }}>Registration and cancellations always go through this contact, never social messages.</p>
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
