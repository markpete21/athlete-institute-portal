import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Bracket from '@/components/compete/Bracket';
import { divisionDetail, type CompeteGame } from '@/lib/compete/compete';

export const dynamic = 'force-dynamic';

const TZ = 'America/Toronto';
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' }) : 'TBD';
const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }) : '';

const PLAY_URL = process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca';
const STREAM = process.env.STREAM_PLAYBACK_BASE ?? 'https://live.athleteinstitute.ca/watch';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Shared standings links get a real title in previews, not the app default. */
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const detail = await divisionDetail(Number(params.id));
  if (!detail) return {};
  const program = detail.division.programName;
  return { title: `${detail.division.name}${program ? ` · ${program}` : ''} — Compete. Athlete Institute` };
}

function GameRow({ g }: { g: CompeteGame }) {
  const started = g.startsAt && Date.parse(g.startsAt) <= Date.now();
  return (
    <div className="cs-game">
      <span className="cs-when">
        <b>{fmtDate(g.startsAt)}</b>
        <span>{fmtTime(g.startsAt)}</span>
      </span>
      <span className="cs-matchup">
        <b>{g.homeTeam}</b> <span className="cs-vs">vs</span> <b>{g.awayTeam}</b>
        {g.stage === 'playoff' && <span className="cs-po label text-[9px]">Playoff</span>}
      </span>
      {g.status === 'final' ? (
        <span className="cs-score mono">{g.homeScore}&ndash;{g.awayScore}{g.overtime && <span className="cs-ot"> OT</span>}</span>
      ) : (
        <span className="cs-pending label text-[10px]">{g.round ? `Round ${g.round}` : 'Scheduled'}</span>
      )}
      {g.liveStreamRef && (
        <a className="cs-watch" href={`${STREAM}/${g.liveStreamRef}`} target="_blank" rel="noreferrer">
          {g.status === 'final' ? 'Watch' : started ? 'Watch live' : 'Watch'}
        </a>
      )}
    </div>
  );
}

/**
 * One division, public — everything on one page, schedule first-class:
 * expandable Standings up top, playoff bracket when one exists, then the
 * schedule (all future games + the last week's scores; older results fold
 * away), rosters at the bottom. Names are masked per the division's
 * show_full_names toggle by lib/compete (never here).
 */
export default async function DivisionPage({ params }: { params: { id: string } }) {
  const detail = await divisionDetail(Number(params.id));
  if (!detail) notFound();
  const { division, standings, games, rosters } = detail;

  const isVb = standings.sport === 'volleyball';
  const unit = isVb ? 'S' : 'PF';
  // Tournament-mode programs are a bracket start to finish; leagues split
  // regular season (standings + schedule) from playoff games (bracket).
  const bracketGames = division.tournamentMode ? games : games.filter((g) => g.stage === 'playoff');
  const listGames = division.tournamentMode ? games : games.filter((g) => g.stage !== 'playoff');

  // Schedule default view: every future game, plus the last week's scores.
  // Anything older folds away behind "Earlier results".
  const now = Date.now();
  const results = listGames.filter((g) => g.status === 'final').reverse(); // newest first
  const upcoming = listGames.filter((g) => g.status !== 'final');
  const recent = results.filter((g) => g.startsAt && now - Date.parse(g.startsAt) <= WEEK_MS);
  const earlier = results.filter((g) => !g.startsAt || now - Date.parse(g.startsAt) > WEEK_MS);
  const anyPlayed = standings.standings.some((r) => r.gp > 0);

  const byTeam = new Map<string, string[]>();
  for (const r of rosters) {
    if (!byTeam.has(r.teamName)) byTeam.set(r.teamName, []);
    byTeam.get(r.teamName)!.push(r.displayName);
  }

  return (
    <>
      <div className="cs-head">
        <Link href="/" className="label text-[11px]">← All divisions</Link>
        <p className="label text-[11px]" style={{ marginTop: 8 }}>{division.programName}</p>
        <h1 className="cs-h1">{division.name}<span className="cs-h1-dot">.</span></h1>
      </div>

      {/* Standings — expandable, collapsed so the schedule stays the focus */}
      <details className="cs-fold">
        <summary className="cs-fold-sum">Standings</summary>
        <div className="cs-fold-body">
          {!anyPlayed ? (
            <p className="cs-empty">No games played yet.</p>
          ) : (
            <div className="cs-tablewrap">
              <table className="cs-table">
                <thead><tr><th>#</th><th>Team</th><th>GP</th><th>W</th><th>L</th><th>Win%</th><th>{unit}</th><th>Diff</th><th>Strk</th></tr></thead>
                <tbody>
                  {standings.standings.map((r, i) => (
                    <tr key={r.team}>
                      <td className="mono">{i + 1}</td>
                      <td className="cs-team">{standings.teamNames.get(r.team)}</td>
                      <td className="mono">{r.gp}</td><td className="mono">{r.w}</td><td className="mono">{r.l}</td>
                      <td className="mono">{r.winPct.toFixed(3)}</td><td className="mono">{r.pf}</td>
                      <td className="mono">{r.diff > 0 ? `+${r.diff}` : r.diff}</td><td className="mono">{r.streak}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>

      {/* Playoff bracket, once matchups exist */}
      {bracketGames.length > 0 && (
        <section className="cs-sec">
          <h2 className="cs-h2">{division.tournamentMode ? 'Bracket' : 'Playoffs'}</h2>
          <Bracket games={bracketGames} />
        </section>
      )}

      {/* Schedule — the main event: future games + last week's scores */}
      <section className="cs-sec">
        <h2 className="cs-h2">Schedule &amp; results</h2>
        {listGames.length === 0 ? (
          <p className="cs-empty">The schedule hasn&apos;t been published yet.</p>
        ) : (
          <>
            <div className="cs-games">
              {[...upcoming, ...recent].map((g) => <GameRow key={g.id} g={g} />)}
            </div>
            {earlier.length > 0 && (
              <details className="cs-earlier">
                <summary className="label text-[11px]">Earlier results ({earlier.length})</summary>
                <div className="cs-games" style={{ marginTop: 8 }}>
                  {earlier.map((g) => <GameRow key={g.id} g={g} />)}
                </div>
              </details>
            )}
          </>
        )}
      </section>

      {/* Rosters — names masked per the division toggle */}
      {byTeam.size > 0 && (
        <section className="cs-sec">
          <h2 className="cs-h2">Rosters</h2>
          <div className="cs-rosters">
            {[...byTeam.entries()].map(([team, names]) => (
              <div key={team} className="cs-roster">
                <b>{team}</b>
                <ul>{names.map((n, i) => <li key={i}>{n}</li>)}</ul>
              </div>
            ))}
          </div>
          {!division.showFullNames && (
            <p className="cs-note">Last names are shown as an initial on this division.</p>
          )}
        </section>
      )}

      <section className="cs-cta">
        <div>
          <b>Want to play?</b>
          <span>Registration, schedules and payments all live in Play. App.</span>
        </div>
        <a className="cs-cta-btn" href={`${PLAY_URL}/programs`}>Register on Play. App →</a>
      </section>
    </>
  );
}
