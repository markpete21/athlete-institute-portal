import Link from 'next/link';
import type { Block } from '@/lib/site/blocks';
import { publicBlocks } from '@/lib/site/blocks';
import type { BrandSite } from '@/lib/site/sites';
import { getLocation, getProgram, listLocations, listPrograms, locationStatusLabel, programStatusLabel, SPORTS, sportBySlug } from '@/lib/site/records';
import { publishedPosts } from '@/lib/site/posts';
import { divisionDetail, upcomingGames, programLanding } from '@/lib/compete/compete';
import { Chev, FactsDl, SecHead, StatusPill, T } from '@/components/site/ui';
import LeadForm from '@/components/site/LeadForm';
import ProgramBlock from '@/components/site/ProgramBlock';
import { fmtDay, fmtTime } from '@/lib/site/context';

/**
 * The block renderer (Module 23 §5): every block type, one renderer set,
 * themed through CSS variables so each theme pack renders all of them.
 * Server component: record-bound blocks (programs, locations, standings,
 * stories) read live data here, never from copies in the block.
 */
export interface RenderCtx { site: BrandSite; brandKey: string; preview: boolean }

export default async function BlockRenderer({ blocks, ctx }: { blocks: Block[]; ctx: RenderCtx }) {
  const visible = publicBlocks(blocks);
  return <>{await Promise.all(visible.map((b) => renderBlock(b, ctx)))}</>;
}

const P = (b: Block) => b.props as Record<string, never>;
const s = (v: unknown) => (typeof v === 'string' ? v : '');
const n = (v: unknown, d: number) => (typeof v === 'number' ? v : Number(v) || d);

async function renderBlock(b: Block, ctx: RenderCtx): Promise<JSX.Element | null> {
  const p = P(b);
  const key = b.id;
  switch (b.type) {
    case 'hero': return <Hero key={key} p={p} ctx={ctx} />;
    case 'rich_text': return (
      <section key={key} className="sec"><div className="wrap">
        {s(p.label) && <SecHead label={s(p.label)} />}
        <div className="grid">
          {s(p.heading) && <div className="left"><h2>{s(p.heading)}</h2></div>}
          <div className={s(p.heading) ? 'right rich' : s(p.width) === 'wide' ? 'full rich' : 'right rich'} dangerouslySetInnerHTML={{ __html: tbc(s(p.html), ctx.preview) }} />
        </div>
      </div></section>
    );
    case 'columns': {
      const cols = (p.columns as unknown as Block[][]) ?? [];
      return (
        <section key={key} className="sec"><div className="wrap"><div className="cols" style={{ gridTemplateColumns: `repeat(${Math.max(1, cols.length)}, minmax(0,1fr))` }}>
          {await Promise.all(cols.map(async (c, i) => <div key={i} className="col">{await Promise.all(publicBlocks(c).map((x) => renderBlock(x, ctx)))}</div>))}
        </div></div></section>
      );
    }
    case 'image': {
      const img = (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s(p.imageUrl)} alt={s(p.alt)} loading="lazy" />
      );
      return (
        <section key={key} className={`sec sec--img sec--${s(p.size) || 'wide'}`}><div className="wrap"><figure className="fig">
          {s(p.href) ? <a href={s(p.href)}>{img}</a> : img}
          {(s(p.caption) || s(p.credit)) && <figcaption className="note">{s(p.caption)}{s(p.credit) ? ` · Photo ${s(p.credit)}` : ''}</figcaption>}
        </figure></div></section>
      );
    }
    case 'gallery_grid': {
      const images = (p.images as unknown as { url: string; alt: string }[]) ?? [];
      return (
        <section key={key} className="sec"><div className="wrap"><div className="gal">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {images.map((im, i) => <img key={i} src={im.url} alt={im.alt} loading="lazy" />)}
        </div></div></section>
      );
    }
    case 'video': {
      const url = s(p.url);
      if (!url) return null;
      const isFile = /\.(mp4|webm)(\?|$)/i.test(url);
      return (
        <section key={key} className="sec"><div className="wrap"><div className="video">
          {isFile ? <video src={url} controls playsInline preload="metadata" /> : <iframe src={toEmbed(url)} title="Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen loading="lazy" />}
        </div></div></section>
      );
    }
    case 'cta_band': {
      const btns = (p.buttons as unknown as { label: string; href: string; style: string }[]) ?? [];
      const bg = s(p.background) || 'ink';
      return (
        <section key={key} className={`cta-band cta-band--${bg} ${bg !== 'white' ? 'on-dark' : ''}`}><div className="wrap"><div className="grid" style={{ rowGap: 20 }}>
          <div className="left"><h2>{s(p.heading)}</h2>{s(p.body) && <p className="muted" style={{ marginTop: 12 }}><T preview={ctx.preview}>{s(p.body)}</T></p>}</div>
          <div className="right cta-btns">{btns.map((x, i) => <a key={i} className={`pill ${x.style === 'red' ? 'pill--red' : x.style === 'line' ? 'pill--line' : bg === 'white' ? 'pill--ink' : 'pill--white'}`} href={x.href}>{x.label}</a>)}</div>
        </div></div></section>
      );
    }
    case 'program_grid': {
      const progs = await listPrograms(ctx.brandKey, { locationSlug: s(p.locationSlug) || undefined, sport: s(p.sport) || undefined });
      const locs = await listLocations(ctx.brandKey);
      return (
        <section key={key} className="sec"><div className="wrap">{s(p.label) && <SecHead label={s(p.label)} />}<div className="rows">
          {progs.slice(0, n(p.limit, 12)).map((pr) => { const l = locs.find((x) => x.slug === pr.locationSlug); const st = programStatusLabel(pr); return (
            <Link key={pr.id} className="row" href={`/${pr.locationSlug}/${pr.sport}#${pr.slug}`}><h3>{pr.name}</h3><span className="meta">{pr.leagueType} · {l?.name ?? pr.locationSlug}</span><span className="end"><StatusPill label={st.label} live={st.live} /><Chev /></span></Link>
          ); })}
          {progs.length === 0 && <p className="muted">No programs published yet.</p>}
        </div></div></section>
      );
    }
    case 'program_card': {
      const pr = await getProgram(ctx.brandKey, s(p.programSlug));
      if (!pr) return ctx.preview ? <section key={key} className="sec"><div className="wrap"><p className="note">Program block: choose a program record.</p></div></section> : null;
      const l = await getLocation(ctx.brandKey, pr.locationSlug);
      return <section key={key} className="sec"><div className="wrap"><ProgramBlock program={pr} location={l} ctx={ctx} primary={p.open !== false} /></div></section>;
    }
    case 'standings_table': {
      const id = n(p.divisionId, 0);
      if (!id) return null;
      const d = await divisionDetail(id);
      if (!d || (d.division.brandKey && d.division.brandKey !== ctx.brandKey)) return null;
      const rows = d.standings.standings.slice(0, n(p.limit, 8));
      return (
        <section key={key} className="sec"><div className="wrap"><SecHead label={`${d.division.name} standings`} right={<Link href={`/standings/${id}`}>Full standings</Link>} />
          <div className="tbl-wrap"><table><thead><tr><th>#</th><th>Team</th><th className="num">GP</th><th className="num">W</th><th className="num">L</th><th className="num">Diff</th></tr></thead><tbody>
            {rows.map((r, i) => <tr key={r.team}><td>{i + 1}</td><td className="team">{d.standings.teamNames.get(r.team)}</td><td className="num">{r.gp}</td><td className="num">{r.w}</td><td className="num">{r.l}</td><td className="num">{r.diff > 0 ? `+${r.diff}` : r.diff}</td></tr>)}
          </tbody></table></div></div></section>
      );
    }
    case 'schedule_strip': {
      const games = (await upcomingGames(n(p.count, 6), ctx.brandKey)).filter((g) => !n(p.divisionId, 0) || g.divisionId === n(p.divisionId, 0));
      return (
        <section key={key} className="sec"><div className="wrap"><SecHead label={s(p.label) || 'This week'} right={<Link href="/scores">All games</Link>} />
          {games.length === 0 ? <p className="muted">No upcoming games published.</p> : games.map((g) => (
            <Link key={g.id} className="game" href={`/standings/${g.divisionId}`}><span className="when"><b>{fmtDay(g.startsAt)}</b><span className="note">{fmtTime(g.startsAt)}{g.facilityName ? ` · ${g.facilityName}` : ''}</span></span><span className="teams"><span>{g.homeTeam}</span><i>vs</i><span>{g.awayTeam}</span></span><span className="note">{g.divisionName}</span></Link>
          ))}
        </div></section>
      );
    }
    case 'bracket': {
      const id = n(p.divisionId, 0);
      if (!id) return null;
      const d = await divisionDetail(id);
      if (!d) return null;
      const { default: Bracket } = await import('@/components/compete/Bracket');
      const games = d.division.tournamentMode ? d.games : d.games.filter((g) => g.stage === 'playoff');
      return <section key={key} className="sec"><div className="wrap site-compete"><SecHead label={`${d.division.name} bracket`} /><Bracket games={games} /></div></section>;
    }
    case 'news_list': {
      const posts = await publishedPosts(ctx.brandKey, { limit: n(p.count, 3), type: s(p.type) || undefined });
      return (
        <section key={key} className="sec"><div className="wrap"><SecHead label={s(p.label) || 'Stories'} right={<Link href="/stories">All stories</Link>} />
          {posts.map((st) => <Link key={st.id} className="story" href={`/stories/${st.slug}`}><div className="m">{st.type}<br />{st.publishedAt ? fmtDay(st.publishedAt) : ''}</div><div><h3>{st.title}</h3>{st.excerpt && <p className="muted" style={{ marginTop: 6, fontSize: 15 }}>{st.excerpt}</p>}</div></Link>)}
          {posts.length === 0 && <p className="muted">No stories yet.</p>}
        </div></section>
      );
    }
    case 'sponsors': {
      let items = (p.items as unknown as { name: string; logoUrl: string; href: string }[]) ?? [];
      if (n(p.programId, 0)) { const l = await programLanding(n(p.programId, 0)); if (l) items = l.sponsors.map((x) => ({ name: x.name, logoUrl: x.logoUrl ?? '', href: '' })); }
      if (!items.length) return null;
      return (
        <section key={key} className="sec"><div className="wrap"><SecHead label={s(p.label) || 'Sponsors'} /><ul className="logo-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {items.map((x, i) => <li key={i}>{x.logoUrl ? <img src={x.logoUrl} alt={x.name} /> : <span className="label">{x.name}</span>}</li>)}
        </ul></div></section>
      );
    }
    case 'staff_cards': {
      const loc = s(p.locationSlug) ? await getLocation(ctx.brandKey, s(p.locationSlug)) : null;
      return (
        <section key={key} className="sec"><div className="wrap"><SecHead label={s(p.label) || 'Coaches'} /><div className="grid"><div className="left"><h2>Who coaches<br />here.</h2></div><div className="right"><p className="muted">Coach profiles{loc ? ` for ${loc.name}` : ''} are <T preview={ctx.preview}>[TBC]</T>. Every coach is screened before working with players.</p></div></div></div></section>
      );
    }
    case 'faq': {
      const items = (p.items as unknown as { q: string; a: string; note?: string }[]) ?? [];
      return (
        <section key={key} className="sec"><div className="wrap"><div className="grid">
          <div className="left">{s(p.label) && <span className="label">{s(p.label)}</span>}{ctx.site.settings.ask_enabled !== false && <p className="muted" style={{ marginTop: 12 }}>Can&apos;t find it? <button type="button" data-ask style={{ textDecoration: 'underline' }}>Ask {ctx.site.name.replace(' Sport', '')}</button>.</p>}</div>
          <div className="right acc">{items.map((f, i) => (
            <details key={i} open={p.openFirst !== false && i === 0}><summary>{f.q}<span className="chev down" aria-hidden="true" /></summary><div className="body"><p><T preview={ctx.preview}>{f.a}</T></p>{f.note && <p className="muted"><T preview={ctx.preview}>{f.note}</T></p>}</div></details>
          ))}</div>
        </div></div></section>
      );
    }
    case 'stats_band': {
      const items = (p.items as unknown as { label: string; value: string }[]) ?? [];
      return <section key={key} className="sec"><div className="wrap"><div className="stats">{items.map((x, i) => <div key={i} className="stat"><b>{x.value}</b><span className="label">{x.label}</span></div>)}</div></div></section>;
    }
    case 'contact_card': return (
      <section key={key} className="sec" id="contact"><div className="wrap"><SecHead label={s(p.label) || 'Contact'} /><div className="grid"><div className="left"><h2>Talk to us.</h2></div><div className="right">
        <FactsDl preview={ctx.preview} facts={[['Email', ctx.site.contact.email ?? '[TBC]'], ['Phone', ctx.site.contact.phone ?? '[TBC]'], ...(ctx.site.contact.address ? [['Mail', ctx.site.contact.address] as [string, string]] : [])]} />
        <p className="note" style={{ marginTop: 12 }}>Registration and cancellations always go through this contact, never social messages.</p>
        {p.showForm && <div style={{ marginTop: 24 }}><LeadForm brandKey={ctx.brandKey} variant="contact" siteName={ctx.site.name} /></div>}
      </div></div></div></section>
    );
    case 'map': return s(p.embedUrl) ? <section key={key} className="sec"><div className="wrap"><div className="video map"><iframe src={s(p.embedUrl)} title="Map" loading="lazy" allowFullScreen /></div></div></section> : null;
    case 'embed': return s(p.url) ? <section key={key} className="sec"><div className="wrap"><div className="video"><iframe src={toEmbed(s(p.url))} title="Embedded content" loading="lazy" allowFullScreen /></div></div></section> : null;
    case 'spacer': return <div key={key} className={`spacer spacer--${s(p.size) || 'md'}`} aria-hidden="true" />;
    case 'divider': return <div key={key} className="wrap"><hr className="rule" /></div>;
    case 'why_band': return <WhyBand key={key} p={p} ctx={ctx} />;
    case 'partners': {
      const items = (p.items as unknown as { name: string; logoUrl: string; factor: number; href?: string }[]) ?? [];
      return (
        <section key={key} className="partners on-dark" aria-labelledby={`${key}-h`}><div className="wrap"><div className="sec-head"><h2 className="label" id={`${key}-h`}>{s(p.label) || 'Partners'}</h2></div>
          <ul className="partner-logos">{items.map((x, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <li key={i}>{x.href ? <a href={x.href} target="_blank" rel="noopener"><img src={x.logoUrl} alt={x.name} style={{ ['--f' as string]: x.factor }} /></a> : <img src={x.logoUrl} alt={x.name} style={{ ['--f' as string]: x.factor }} />}</li>
          ))}</ul></div></section>
      );
    }
    case 'location_list': {
      const locs = await listLocations(ctx.brandKey);
      return (
        <section key={key} className="sec" id="locations"><div className="wrap"><SecHead label={s(p.label) || 'Locations'} /><div className="rows">
          {locs.map((l) => { const st = locationStatusLabel(l); return <Link key={l.slug} className="row" href={`/${l.slug}`}><h3>{l.name}</h3><span className="meta">{l.venue}</span><span className="end"><StatusPill label={st.label} live={st.live} /><Chev /></span></Link>; })}
          {p.showRequestRow !== false && <Link className="row" href="/locations#request"><h3>Your area</h3><span className="meta">Request a location, or host a program at your school or facility.</span><span className="end"><span className="status status--soon">Request</span><Chev /></span></Link>}
        </div></div></section>
      );
    }
    case 'sport_list': return <section key={key} className="sec"><div className="wrap">{s(p.label) && <SecHead label={s(p.label)} />}<SportTiles /></div></section>;
    case 'fact_block': {
      let facts = (p.facts as unknown as [string, string][]) ?? [];
      let heading = s(p.heading);
      if (s(p.programSlug)) { const pr = await getProgram(ctx.brandKey, s(p.programSlug)); if (pr) { facts = pr.facts; heading = heading || `${pr.name}.`; } }
      if (s(p.locationSlug)) { const l = await getLocation(ctx.brandKey, s(p.locationSlug)); if (l) { facts = [['Address', l.address ?? '[TBC]'], ['Parking', l.parking ?? '[TBC]'], ['Arrival', l.arrival ?? '[TBC]'], ['Contact', l.contact ?? '[TBC]']]; heading = heading || `${l.venue ?? l.name}.`; } }
      return (
        <section key={key} className="sec"><div className="wrap">{s(p.label) && <SecHead label={s(p.label)} />}<div className="grid">
          <div className="left">{heading && <h2>{heading.split('<br>').map((x, i) => <span key={i}>{i > 0 && <br />}{x}</span>)}</h2>}</div>
          <div className="right"><FactsDl facts={facts} preview={ctx.preview} />{s(p.note) && <p className="note" style={{ marginTop: 12 }}><T preview={ctx.preview}>{s(p.note)}</T></p>}</div>
        </div></div></section>
      );
    }
    case 'season_calendar': {
      let items = (p.items as unknown as [string, string][]) ?? [];
      if (s(p.locationSlug)) { const l = await getLocation(ctx.brandKey, s(p.locationSlug)); if (l?.calendar.length) items = l.calendar; }
      if (!items.length) items = [['Registration opens', '[TBC]'], ['Placement', '[TBC]'], ['Jerseys', '[TBC]'], ['First session', '[TBC]'], ['Last session', '[TBC]']];
      return <section key={key} className="sec"><div className="wrap"><SecHead label={s(p.label) || 'Season calendar'} /><div className="grid"><div className="left"><h2>Key dates.</h2></div><div className="right"><FactsDl facts={items} preview={ctx.preview} /></div></div></div></section>;
    }
    case 'interest_form': {
      const pr = s(p.programSlug) ? await getProgram(ctx.brandKey, s(p.programSlug)) : null;
      return <section key={key} className="sec"><div className="wrap"><div className="grid"><div className="left"><h2>{s(p.heading) || 'Be first to know.'}</h2></div><div className="right"><LeadForm brandKey={ctx.brandKey} variant="interest" context={pr?.name ?? s(p.context) ?? ctx.site.name} siteName={ctx.site.name} /></div></div></div></section>;
    }
    case 'big_buttons': {
      const btns = (p.buttons as unknown as { label: string; href: string }[]) ?? [];
      return <section key={key} className="sec"><div className="wrap">{s(p.label) && <SecHead label={s(p.label)} />}<div className="bigbtns">{btns.map((x, i) => <Link key={i} className="bigbtn" href={x.href}><span>{x.label}</span><Chev /></Link>)}</div></div></section>;
    }
    case 'request_form': {
      const variant = (s(p.variant) || 'location') as 'location' | 'training' | 'assistance' | 'contact';
      const progs = variant === 'assistance' ? await listPrograms(ctx.brandKey) : [];
      const locs = variant === 'assistance' ? await listLocations(ctx.brandKey) : [];
      return (
        <section key={key} className="sec" id={variant === 'location' ? 'request' : undefined}><div className="wrap"><div className="grid" style={{ rowGap: 40 }}>
          <div className="left"><h2>{s(p.heading) || (variant === 'location' ? 'Bring us to your area.' : variant === 'training' ? 'Request a session.' : variant === 'assistance' ? 'Ask privately.' : 'Talk to us.')}</h2>{s(p.note) && <p className="muted" style={{ marginTop: 14 }}><T preview={ctx.preview}>{s(p.note)}</T></p>}</div>
          <div className="right"><LeadForm brandKey={ctx.brandKey} variant={variant} siteName={ctx.site.name} programOptions={progs.map((x) => `${x.name} · ${locs.find((l) => l.slug === x.locationSlug)?.name ?? x.locationSlug}`)} /></div>
        </div></div></section>
      );
    }
    default: return null;
  }
}

function tbc(html: string, preview: boolean): string {
  return html.replace(/\[TBC\]/g, `<em class="tbc">${preview ? '[TBC]' : 'To be confirmed'}</em>`);
}

function toEmbed(url: string): string {
  try {
    const u = new URL(url);
    if ((u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com') && u.searchParams.get('v')) return `https://www.youtube-nocookie.com/embed/${u.searchParams.get('v')}`;
    if (u.hostname === 'youtu.be') return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
    if (u.hostname === 'vimeo.com') return `https://player.vimeo.com/video/${u.pathname.split('/').filter(Boolean)[0]}`;
    return url;
  } catch { return url; }
}

/** Home hero (ALL CAN §4.1): full-bleed photo, wordmark, two-line tagline, one red pill. */
function Hero({ p, ctx }: { p: Record<string, never>; ctx: RenderCtx }) {
  const photo = s(p.style) === 'photo' && s(p.imageUrl);
  const lines = (p.headingLines as unknown as string[] | undefined)?.filter(Boolean) ?? (s(p.heading) ? [s(p.heading)] : []);
  const accent = s(p.accentWord);
  const full = s(p.height) === 'full';
  return (
    <section className={`hero ${photo ? 'hero--photo' : ''} ink on-dark`} style={!full ? { minHeight: 'min(60vh, 560px)' } : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {photo && <img className="hero-img" src={s(p.imageUrl)} alt={s(p.imageAlt)} />}
      {photo && <span className="hero-scrim" aria-hidden="true" />}
      {(s(p.credit) || photo) && <span className="vcredit">Photo <T preview={ctx.preview}>{s(p.credit) || '[TBC]'}</T></span>}
      <div className="wrap"><div className="grid">
        <div className="left" style={{ gridColumn: '1 / span 8' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {s(p.logoUrl) && <img src={s(p.logoUrl)} alt="" style={{ width: 'min(320px,80%)', height: 'auto', display: 'block', marginBottom: 28 }} />}
          {s(p.kicker) && <p className="kicker" style={{ color: 'var(--silver)' }}>{s(p.kicker)}</p>}
          {s(p.wordmarkUrl) ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="hero-logo" src={s(p.wordmarkUrl)} alt={s(p.wordmarkAlt) || ctx.site.name} />
              <h1 className="tagline">{lines.map((l, i) => <span key={i}>{accent && l.startsWith(accent) ? <><span className="tag-red">{accent}</span>{l.slice(accent.length)}</> : l}</span>)}</h1>
            </>
          ) : (
            <>
              {!s(p.kicker) && !s(p.logoUrl) && <div className="lane" aria-hidden="true"><i /><i /><i /></div>}
              <h1>{lines.join(' ')}</h1>
              {s(p.subheading) && <p className="sub"><T preview={ctx.preview}>{s(p.subheading)}</T></p>}
            </>
          )}
        </div>
        {(s(p.ctaLabel) || s(p.ctaSecondaryLabel)) && (
          <div className="cta">
            {s(p.ctaLabel) && <Link className="pill pill--red" href={s(p.ctaHref) || '/'}>{s(p.ctaLabel)}</Link>}
            {s(p.ctaSecondaryLabel) && <Link className="pill pill--white" href={s(p.ctaSecondaryHref) || '/'}>{s(p.ctaSecondaryLabel)}</Link>}
          </div>
        )}
      </div></div>
    </section>
  );
}

/** Why band (ALL CAN §4.1): mission left, pillar rows right, sport tiles below. */
function WhyBand({ p, ctx }: { p: Record<string, never>; ctx: RenderCtx }) {
  const pillars = (p.pillars as unknown as [string, string][]) ?? [];
  return (
    <section className="sec" id="why"><div className="wrap">
      <SecHead label={s(p.label) || 'Why'} />
      <div className="grid" style={{ rowGap: 40 }}>
        <div className="left"><p className="why-mission"><T preview={ctx.preview}>{s(p.mission)}</T></p></div>
        <div className="right"><div className="pillar-rows">
          {pillars.map(([word, tail], i) => (
            <div key={i} className="pillar-row"><b>
              <span className="pillar-word">{word.replace(/\.$/, '') === 'Play' ? <>Play<span className="ac-ball" aria-hidden="true" /><span className="sr">.</span></> : word}</span>
              {' '}<span className="pillar-tail">{tail}</span>
            </b></div>
          ))}
        </div></div>
      </div>
      {p.showSports !== false && <div className="why-sports"><SportTiles /></div>}
    </div></section>
  );
}

export function SportTiles() {
  return (
    <div className="sports">
      {SPORTS.map((sp) => sp.status === 'live' ? (
        <Link key={sp.slug} className="sport" href={`/${sp.slug}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="sport-mark" src={sp.markUrl} alt="" aria-hidden="true" />
          <span><span className="status status--live">Now playing</span></span>
          <h3>{sp.name}.</h3>
          <ul>{sp.programs.map((l) => <li key={l[1]}>{l[1]}</li>)}</ul>
        </Link>
      ) : (
        <div key={sp.slug} className="sport">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="sport-mark" src={sp.markUrl} alt="" aria-hidden="true" />
          <span><span className="status">Coming soon</span></span>
          <h3>{sp.name}.</h3>
          <ul className="muted">{sp.programs.map((l) => <li key={l[1]}>{l[1]}</li>)}</ul>
          <Link className="sport-req" href={`/locations?sport=${sp.slug}#request`}>Request<Chev /><span className="sr"> {sp.name} near you</span></Link>
        </div>
      ))}
    </div>
  );
}

export { sportBySlug };
