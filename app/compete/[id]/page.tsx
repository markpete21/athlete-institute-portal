import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Bracket from '@/components/compete/Bracket';
import AveragesTable from '@/components/compete/AveragesTable';
import Crest from '@/components/compete/crest';
import DivisionTabs from '@/components/compete/DivisionTabs';
import { divisionDetail, divisionStats, type CompeteGame } from '@/lib/compete/compete';

export const dynamic = 'force-dynamic';

const TZ = 'America/Toronto';
const fmtWd = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ, weekday: 'short' }).toUpperCase() : '';
const fmtMd = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ, month: 'short', day: 'numeric' }).toUpperCase() : 'TBD';
const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }) : '';

const PLAY_URL = process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca';
const STREAM = process.env.STREAM_PLAYBACK_BASE ?? 'https://live.athleteinstitute.ca/watch';

/** Shared standings links get a real title in previews, not the app default. */
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const detail = await divisionDetail(Number(params.id));
  if (!detail) return {};
  const program = detail.division.programName;
  return { title: `${detail.division.name}${program ? ` · ${program}` : ''} — Compete. Athlete Institute` };
}

/**
 * Scoreboard card — date tile, crested team rows, status rail. Winner's row
 * is bold with a gold caret so results scan without reading numbers.
 */
function GameCard({ g }: { g: CompeteGame }) {
  const final = g.status === 'final' && g.homeScore != null && g.awayScore != null;
  const homeWin = final && g.homeScore! > g.awayScore!;
  const awayWin = final && g.awayScore! > g.homeScore!;
  const started = g.startsAt && Date.parse(g.startsAt) <= Date.now();
  return (
    <div className={final ? 'cs-gcard' : 'cs-gcard future'}>
      <div className="cs-gdate">
        <span className="d1">{fmtWd(g.startsAt)}</span>
        <span className="d2">{fmtMd(g.startsAt)}</span>
        <span className="d3">{fmtTime(g.startsAt)}</span>
      </div>
      <div className="cs-gteams">
        <div className={homeWin ? 'cs-grow win' : 'cs-grow'}>
          <Crest name={g.homeTeam} />
          <span className="cs-gname">{g.homeTeam}</span>
          {final && <span className="cs-gscore mono">{g.homeScore}</span>}
        </div>
        <div className={awayWin ? 'cs-grow win' : 'cs-grow'}>
          <Crest name={g.awayTeam} />
          <span className="cs-gname">{g.awayTeam}</span>
          {final && <span className="cs-gscore mono">{g.awayScore}</span>}
        </div>
      </div>
      <div className="cs-gmeta">
        {final ? (
          <span className="cs-gstat">Final{g.overtime ? ' · OT' : ''}</span>
        ) : (
          <span className="cs-gstat sched">{fmtTime(g.startsAt) || (g.round ? `Round ${g.round}` : 'TBD')}</span>
        )}
        {g.stage === 'playoff' && <span className="cs-gstat">Playoff{g.round ? ` · R${g.round}` : ''}</span>}
        {g.liveStreamRef && (
          <a className="cs-gwatch" href={`${STREAM}/${g.liveStreamRef}`} target="_blank" rel="noreferrer">
            {final ? 'Watch' : started ? 'Watch live' : 'Watch live'} ↗
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * One division, public — tabbed, schedule first (Mark's layout, 2026-08-07):
 * Schedule & Results = upcoming scoreboard cards, then results newest-first,
 * playoff bracket at the bottom. Standings and Rosters are their own tabs.
 * Names are masked per the division's show_full_names toggle by lib/compete
 * (never here). Everything reads the shared tables — no snapshots.
 */
export default async function DivisionPage({ params }: { params: { id: string } }) {
  const detail = await divisionDetail(Number(params.id));
  if (!detail) notFound();
  const { division, standings, games, rosters } = detail;
  const stats = division.statsEnabled ? await divisionStats(division.id) : null;

  const isVb = standings.sport === 'volleyball';
  const unit = isVb ? 'S' : 'PF';
  // Tournament-mode programs are a bracket start to finish; leagues split
  // regular season (schedule cards) from playoff games (bracket below).
  const bracketGames = division.tournamentMode ? games : games.filter((g) => g.stage === 'playoff');
  const listGames = division.tournamentMode ? games : games.filter((g) => g.stage !== 'playoff');

  const results = listGames.filter((g) => g.status === 'final').reverse(); // newest first
  const upcoming = listGames.filter((g) => g.status !== 'final');
  const anyPlayed = standings.standings.some((r) => r.gp > 0);

  const byTeam = new Map<string, string[]>();
  for (const r of rosters) {
    if (!byTeam.has(r.teamName)) byTeam.set(r.teamName, []);
    byTeam.get(r.teamName)!.push(r.displayName);
  }

  const schedulePane = (
    <>
      {division.tournamentMode && bracketGames.length > 0 && (
        <section className="cs-sec">
          <h2 className="cs-h2">Bracket</h2>
          <Bracket games={bracketGames} />
        </section>
      )}
      {listGames.length === 0 && !division.tournamentMode ? (
        <p className="cs-empty">The schedule hasn&apos;t been published yet.</p>
      ) : (
        <>
          {upcoming.length > 0 && (
            <section className="cs-sec">
              <h2 className="cs-h2">Upcoming schedule</h2>
              <div className="cs-gamegrid">{upcoming.map((g) => <GameCard key={g.id} g={g} />)}</div>
            </section>
          )}
          {results.length > 0 && (
            <section className="cs-sec">
              <h2 className="cs-h2">Results</h2>
              <div className="cs-gamegrid">{results.map((g) => <GameCard key={g.id} g={g} />)}</div>
            </section>
          )}
        </>
      )}
      {!division.tournamentMode && bracketGames.length > 0 && (
        <section className="cs-sec">
          <h2 className="cs-h2">Playoffs</h2>
          <Bracket games={bracketGames} />
        </section>
      )}
    </>
  );

  const standingsPane = !anyPlayed ? (
    <p className="cs-empty">No games played yet.</p>
  ) : (
    <div className="cs-tablewrap">
      <table className="cs-table">
        <thead><tr><th>#</th><th>Team</th><th>GP</th><th>W</th><th>L</th><th>Win%</th><th>{unit}</th><th>Diff</th><th>Strk</th></tr></thead>
        <tbody>
          {standings.standings.map((r, i) => (
            <tr key={r.team}>
              <td className="mono">{i + 1}</td>
              <td className="cs-team"><span className="cs-team-in"><Crest name={standings.teamNames.get(r.team) ?? ''} small />{standings.teamNames.get(r.team)}</span></td>
              <td className="mono">{r.gp}</td><td className="mono">{r.w}</td><td className="mono">{r.l}</td>
              <td className="mono">{r.winPct.toFixed(3)}</td><td className="mono">{r.pf}</td>
              <td className="mono">{r.diff > 0 ? `+${r.diff}` : r.diff}</td><td className="mono">{r.streak}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // Roster names link to profiles only while the stats platform is on — a
  // hidden member ("Team member") never links anywhere.
  const rosterEntries = new Map<string, { name: string; memberId: number }[]>();
  for (const r of rosters) {
    if (!rosterEntries.has(r.teamName)) rosterEntries.set(r.teamName, []);
    rosterEntries.get(r.teamName)!.push({ name: r.displayName, memberId: r.memberId });
  }
  const rostersPane = rosterEntries.size === 0 ? (
    <p className="cs-empty">Rosters haven&apos;t been published yet.</p>
  ) : (
    <>
      <div className="cs-rosters">
        {[...rosterEntries.entries()].map(([team, players]) => (
          <div key={team} className="cs-roster">
            <b className="cs-roster-head"><Crest name={team} small />{team}</b>
            <ul>
              {players.map((p, i) =>
                division.statsEnabled && p.name !== 'Team member' ? (
                  <li key={i}><a className="cs-plink" href={`/${division.id}/player/${p.memberId}`}>{p.name}</a></li>
                ) : (
                  <li key={i}>{p.name}</li>
                ),
              )}
            </ul>
          </div>
        ))}
      </div>
      {!division.showFullNames && (
        <p className="cs-note">Last names are shown as an initial on this division.</p>
      )}
    </>
  );

  const statsPane = stats && (
    <>
      {stats.show.leaders && stats.players.length > 0 && (
        <section className="cs-sec">
          <h2 className="cs-h2">League leaders</h2>
          <div className="cs-leadboards">
            {stats.leaders.map((b) => (
              <div key={b.key} className="cs-lb">
                <span className="label text-[10px]">{b.label}</span>
                <ol>
                  {b.top.map((p, i) => (
                    <li key={p.memberId} className={i === 0 ? 'top' : undefined}>
                      <span className="rk mono">{i + 1}</span>
                      <a className="cs-plink" href={`/${division.id}/player/${p.memberId}`}>{p.name}</a>
                      <span className="tm label text-[9px]">{p.teamName}</span>
                      <span className="val mono">{p[b.key].toFixed(1)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          {stats.leaderMinGp > 1 && <p className="cs-note">Leaders need {stats.leaderMinGp}+ games played.</p>}
        </section>
      )}
      {stats.show.averages && stats.players.length > 0 && (
        <section className="cs-sec">
          <h2 className="cs-h2">Player averages</h2>
          <AveragesTable rows={stats.players} divisionId={division.id} />
        </section>
      )}
      {stats.show.team && anyPlayed && (
        <section className="cs-sec">
          <h2 className="cs-h2">Team stats</h2>
          <div className="cs-tablewrap">
            <table className="cs-table">
              <thead><tr><th>Team</th><th>GP</th><th>{unit}/G</th><th>Opp/G</th><th>Diff</th></tr></thead>
              <tbody>
                {standings.standings.map((r) => (
                  <tr key={r.team}>
                    <td className="cs-team"><span className="cs-team-in"><Crest name={standings.teamNames.get(r.team) ?? ''} small />{standings.teamNames.get(r.team)}</span></td>
                    <td className="mono">{r.gp}</td>
                    <td className="mono">{r.gp ? (r.pf / r.gp).toFixed(1) : '0.0'}</td>
                    <td className="mono">{r.gp ? (r.pa / r.gp).toFixed(1) : '0.0'}</td>
                    <td className="mono">{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {stats.players.length === 0 && (
        <p className="cs-empty">Stats appear as staff enter box scores after each game.</p>
      )}
    </>
  );

  return (
    <>
      <div className="cs-head">
        <Link href="/" className="label text-[11px]">← All divisions</Link>
        {division.programId ? (
          <p className="label mt-2 text-[11px]">
            <Link href={`/p/${division.programId}`} className="hover:text-ink">{division.programName} →</Link>
          </p>
        ) : (
          <p className="label mt-2 text-[11px]">{division.programName}</p>
        )}
        <h1 className="cs-h1">{division.name}<span className="cs-h1-dot">.</span></h1>
      </div>

      <DivisionTabs
        tabs={[
          { id: 'schedule', label: 'Schedule & Results', pane: schedulePane },
          { id: 'standings', label: 'Standings', pane: standingsPane },
          ...(statsPane ? [{ id: 'stats', label: 'Stats', pane: statsPane }] : []),
          { id: 'rosters', label: 'Rosters', pane: rostersPane },
        ]}
      />

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
