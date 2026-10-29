import Link from 'next/link';
import Crest from '@/components/compete/crest';
import type { ProgramLanding } from '@/lib/compete/compete';

const TZ = 'America/Toronto';
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' }) +
  ' · ' +
  new Date(iso).toLocaleTimeString('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const STREAM = process.env.STREAM_PLAYBACK_BASE ?? 'https://live.athleteinstitute.ca/watch';

/**
 * A league/tournament's own front door, shared by Compete and the brand
 * sites: hero in the event's colours (or its uploaded photo/video), logo with
 * monogram fallback, sponsor strip, tickets handoff, divisions grid. Brand
 * colours arrive as CSS vars so the whole page tints from two admin colour
 * pickers.
 */
export default function ProgramLandingPage({ landing, divisionHref, indexHref, indexLabel, registerHref, registerLabel }: {
  landing: ProgramLanding;
  divisionHref: (id: number) => string;
  indexHref: string;
  indexLabel: string;
  registerHref: string | null;
  registerLabel?: string;
}) {
  const { brand } = landing;
  return (
    <div className="cs-land" style={{ ['--lgp' as string]: brand.primary, ['--lga' as string]: brand.accent }}>
      <div className="cs-head">
        <Link href={indexHref} className="label text-[11px]">← {indexLabel}</Link>
      </div>

      <section className={brand.heroUrl && brand.heroType === 'image' ? 'cs-lhero img' : 'cs-lhero'}
        style={brand.heroUrl && brand.heroType === 'image' ? { backgroundImage: `url(${brand.heroUrl})` } : undefined}>
        {brand.heroUrl && brand.heroType === 'video' && (
          <video src={brand.heroUrl} autoPlay muted loop playsInline />
        )}
        {!brand.heroUrl && <span className="cs-lhero-pat" aria-hidden />}
        <span className="cs-lhero-shade" aria-hidden />
        <div className="cs-lhero-in">
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="cs-lmark" src={brand.logoUrl} alt="" />
          ) : (
            <span className="cs-lmark cs-lmark-mono">{landing.name.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 3).map((w) => w[0]).join('').toUpperCase()}</span>
          )}
          <div>
            <p className="cs-lkick">{landing.kind.toUpperCase()}{landing.seasonName ? ` · ${landing.seasonName.toUpperCase()}` : ''}</p>
            <h1 className="cs-lname">{landing.name}</h1>
          </div>
        </div>
      </section>

      <div className="cs-lbar">
        <a className="cs-lbtn solid" href="#divisions">Divisions &amp; standings</a>
        {landing.ticketsUrl && (
          <a className="cs-lbtn" href={landing.ticketsUrl} target="_blank" rel="noreferrer">Tickets ↗</a>
        )}
        {registerHref && <a className="cs-lbtn" href={registerHref}>{registerLabel ?? 'Register ↗'}</a>}
      </div>

      {landing.sponsors.length > 0 && (
        <div className="cs-lsponsors">
          <span className="label text-[10px]">Presented by</span>
          {landing.sponsors.map((s) =>
            s.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={s.id} src={s.logoUrl} alt={s.name} title={s.name} className="cs-lsp img" />
            ) : (
              <span key={s.id} className="cs-lsp">{s.name.toUpperCase()}</span>
            ),
          )}
        </div>
      )}

      <section className="cs-sec" id="divisions">
        <h2 className="cs-h2">Divisions</h2>
        <div className="cs-ldivs">
          {landing.divisions.map((d) => (
            <Link key={d.id} href={divisionHref(d.id)} className="cs-ldiv">
              <b>{d.name}</b>
              <span className="label text-[9px]">{d.sport.toUpperCase()} · {d.teamCount} TEAM{d.teamCount === 1 ? '' : 'S'}</span>
              <span className="cs-ldiv-go">STANDINGS &amp; SCHEDULE →</span>
            </Link>
          ))}
        </div>
      </section>

      {landing.nextGames.length > 0 && (
        <section className="cs-sec">
          <h2 className="cs-h2">Next games</h2>
          <div className="cs-lnext">
            {landing.nextGames.map((g) => (
              <Link key={g.id} href={divisionHref(g.divisionId)} className="cs-lnext-row">
                <span className="cs-lnext-when mono">{fmtWhen(g.startsAt)}</span>
                <span className="cs-lnext-who">
                  <Crest name={g.homeTeam} small /> <b>{g.homeTeam}</b>
                  <i>vs</i>
                  <Crest name={g.awayTeam} small /> <b>{g.awayTeam}</b>
                </span>
                <span className="label text-[9px]">{g.divisionName}{g.facilityName ? ` · ${g.facilityName.toUpperCase()}` : ''}</span>
                {g.liveStreamRef && (
                  <a className="cs-gwatch" href={`${STREAM}/${g.liveStreamRef}`} target="_blank" rel="noreferrer">Watch live ↗</a>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
