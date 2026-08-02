import { listBrands } from '@/lib/brands/brands';
import { upcomingGames } from '@/lib/compete/compete';

/**
 * The upcoming-games strip under the Compete header — every published
 * division's next games, soonest first. Each card: brand logo, matchup, time,
 * division. Hovering opens the detail flap: facility (when the game's booking
 * carries one) and the Watch-live handoff when a stream ref exists.
 * Pure server component; the hover is CSS only.
 */
const TZ = 'America/Toronto';
const STREAM = process.env.STREAM_PLAYBACK_BASE ?? 'https://live.athleteinstitute.ca/watch';

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });

export default async function UpcomingBanner() {
  const [games, brands] = await Promise.all([upcomingGames(12), listBrands()]);
  if (games.length === 0) return null;
  const logo = new Map(brands.map((b) => [b.key, b.logoUrl]));

  return (
    <div className="cs-banner" aria-label="Upcoming games">
      <span className="cs-banner-kicker label text-[10px]">Upcoming</span>
      <div className="cs-banner-track">
        {games.map((g) => {
          const logoUrl = g.brandKey ? logo.get(g.brandKey) : null;
          return (
            <div key={g.id} className="cs-upcard">
              <a href={`/${g.divisionId}`} className="cs-upcard-main">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="cs-upcard-logo" />
                ) : (
                  <span className="cs-upcard-dot" aria-hidden />
                )}
                <span className="cs-upcard-text">
                  <b>{g.homeTeam} <i>vs</i> {g.awayTeam}</b>
                  <span>{fmtDay(g.startsAt)} · {fmtTime(g.startsAt)} · {g.divisionName}</span>
                </span>
              </a>
              <span className="cs-upcard-flap">
                {g.facilityName && <span>{g.facilityName}</span>}
                {g.liveStreamRef && (
                  <a href={`${STREAM}/${g.liveStreamRef}`} target="_blank" rel="noreferrer" className="cs-upcard-live">
                    Watch live
                  </a>
                )}
                {!g.facilityName && !g.liveStreamRef && <span>{g.programName ?? 'Schedule'}</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
