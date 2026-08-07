import { upcomingGames } from '@/lib/compete/compete';
import TickerRail, { type TickerCell } from './TickerRail';

/**
 * The score ticker under the Compete header — every published division's
 * games for the NEXT 7 DAYS, soonest first, with a date tile starting each
 * day (the reference Mark supplied). Cells link to the division page; a red
 * time means the game has a live stream. Data comes from the same
 * upcomingGames() read as before — bookings join supplies the facility for
 * the division page; the ticker keeps to teams/time/division.
 */
const TZ = 'America/Toronto';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const fmtWd = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ, weekday: 'short' }).toUpperCase();
const fmtMd = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ, month: 'short', day: 'numeric' }).toUpperCase();
const fmtDayKey = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD in TZ
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })
    .replace(/\s?([ap])\.?m\.?/i, (_, p) => `${p.toUpperCase()}M`);

export default async function UpcomingBanner() {
  const games = await upcomingGames(40);
  const horizon = Date.now() + WEEK_MS;
  const week = games.filter((g) => Date.parse(g.startsAt) <= horizon);
  if (week.length === 0) return null;

  const cells: TickerCell[] = [];
  let lastDay = '';
  for (const g of week) {
    const day = fmtDayKey(g.startsAt);
    if (day !== lastDay) {
      lastDay = day;
      cells.push({ kind: 'date', key: `d-${day}`, dayLabel: fmtWd(g.startsAt), dateLabel: fmtMd(g.startsAt) });
    }
    cells.push({
      kind: 'game',
      key: `g-${g.id}`,
      href: `/${g.divisionId}`,
      homeTeam: g.homeTeam,
      awayTeam: g.awayTeam,
      timeLabel: fmtTime(g.startsAt),
      divisionLabel: g.divisionName,
      live: !!g.liveStreamRef,
    });
  }

  return <TickerRail cells={cells} />;
}
