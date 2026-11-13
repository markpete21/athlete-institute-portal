import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Crumbs } from '@/components/site/ui';
import { fmtDay } from '@/lib/site/context';
import { listGames, listTeams, type LeagueGame } from '@/lib/site/league';
import { insightsFor, reelsUrls, shotEvents, visibleSeasonLines, type GameEvent, type GameInsights } from '@/lib/site/league-stats';
import { leaders, playerSeasons, playerSlug, seasonHighs, teamSeasons, teamSlug, type PlayerSeason, type SeasonGame } from '@/lib/site/league-season';

/**
 * Free season stats for a site-run league (owner decision, Nov 12 2026: all
 * Circuit stats are public): season leaders, team pages with the written
 * insights, and player pages with a game log and shot map. Everything reads
 * only games whose stats are published (the editor's preview sees all
 * loaded games), and each page 404s until there is something to show.
 */
type Ctx = { brandKey: string; preview: boolean; siteName: string };

const BASE = '/circuit';
export const playerHref = (division: string, team: string, number: string | null, name: string | null) => `${BASE}/players/${playerSlug(division, team, number, name)}`;
export const teamHref = (division: string, team: string) => `${BASE}/teams/${teamSlug(division, team)}`;

async function load(ctx: Ctx, leagueSlug: string) {
  const [games, lines, teams, reels] = await Promise.all([listGames(ctx.brandKey, leagueSlug), visibleSeasonLines(ctx.brandKey, leagueSlug, ctx.preview), listTeams(ctx.brandKey, leagueSlug), reelsUrls(ctx.brandKey, leagueSlug)]);
  const seasonGames: SeasonGame[] = games.map((g) => ({ id: g.id, division: g.division, home: g.home, away: g.away, homeScore: g.homeScore, awayScore: g.awayScore, startsAt: g.startsAt }));
  const logoOf = (name: string) => teams.find((t) => t.name === name)?.logoUrl ?? null;
  return { games, lines, reels, players: playerSeasons(lines, seasonGames), teamRows: teamSeasons(lines, seasonGames), logoOf, fromSuperstat: lines.some((l) => l.source === 'superstat') };
}

function Logo({ url, size = 30 }: { url: string | null; size?: number }) {
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="tl" src={url} alt="" style={{ width: size, height: size }} />;
}

const pctText = (v: number | null) => (v == null ? '–' : `${v}%`);
const Credit = ({ show }: { show: boolean }) => (show ? <p className="note" style={{ marginTop: 20 }}><a href="https://superstatsport.com" target="_blank" rel="noopener">Powered by Superstat</a></p> : null);

function Tiles({ items }: { items: [string, string | number][] }) {
  return <dl className="stat-tiles">{items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

/**
 * Shot map on a full FIBA court (28 m by 15 m, not rotated to a basket):
 * a filled red dot is a make, a hollow dot a miss. Positions are Superstat's.
 */
export function ShotChart({ shots, label }: { shots: GameEvent[]; label: string }) {
  if (!shots.length) return null;
  const W = 280, H = 150;
  const made = shots.filter((s) => s.success).length;
  const threes = shots.filter((s) => s.type === 'three_point');
  return (
    <figure className="shot-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${made} of ${shots.length} shots made`}>
        <rect x="0.5" y="0.5" width={W - 1} height={H - 1} className="court-line" />
        <line x1={W / 2} y1="0" x2={W / 2} y2={H} className="court-line" />
        <circle cx={W / 2} cy={H / 2} r="18" className="court-line" />
        {[0, 1].map((side) => {
          const x0 = side ? W : 0, dir = side ? -1 : 1;
          const hoop = x0 + dir * 15.75;
          return (
            <g key={side}>
              <rect x={side ? W - 58 : 0} y={H / 2 - 24.5} width="58" height="49" className="court-line" />
              <circle cx={hoop} cy={H / 2} r="2.3" className="court-line" />
              <path d={`M ${x0} 9 L ${x0 + dir * 29.9} 9 A 67.5 67.5 0 0 ${side ? 0 : 1} ${x0 + dir * 29.9} ${H - 9} L ${x0} ${H - 9}`} className="court-line" />
            </g>
          );
        })}
        {shots.map((s, i) => <circle key={i} cx={(s.x ?? 0) * W} cy={(s.y ?? 0) * H} r="2.6" className={s.success ? 'shot shot--made' : 'shot shot--miss'} />)}
      </svg>
      <figcaption className="note">{label}: {made} of {shots.length} made ({shots.length ? Math.round((made / shots.length) * 100) : 0}%){threes.length ? ` · threes ${threes.filter((s) => s.success).length} of ${threes.length}` : ''}. Filled is a make, hollow a miss.</figcaption>
    </figure>
  );
}

function InsightsBlock({ ins }: { ins: GameInsights }) {
  const s = ins.summary;
  if (!s) return null;
  const group = (label: string, items?: string[]) => (items && items.length ? <div><p className="kicker">{label}</p><ul>{items.map((t, i) => <li key={i}>{t}</li>)}</ul></div> : null);
  return <div className="insights">{group("What's working", s.whatsWorking)}{group('Focus areas', s.focusAreas)}{group('Suggestions', s.suggestions)}</div>;
}

const resultOf = (g: LeagueGame, team: string) => { const home = g.home === team; const us = home ? g.homeScore : g.awayScore, them = home ? g.awayScore : g.homeScore; return us == null || them == null ? '' : `${us > them ? 'W' : us < them ? 'L' : 'T'} ${us}-${them}`; };

// ---------------------------------------------------------------------------

export async function LeadersPage({ ctx, leagueSlug, division }: { ctx: Ctx; leagueSlug: string; division?: string }) {
  const { players, teamRows, logoOf, fromSuperstat } = await load(ctx, leagueSlug);
  if (!players.length && !teamRows.length) notFound();
  const divs = [...new Set([...players.map((p) => p.division), ...teamRows.map((t) => t.division)])].sort();
  const sel = division && divs.includes(division) ? division : divs[0];
  const inDiv = players.filter((p) => p.division === sel);
  const boards = leaders(inDiv), highs = seasonHighs(inDiv);
  const PlayerCell = ({ p }: { p: PlayerSeason }) => <Link className="ldr-who" href={playerHref(p.division, p.team, p.number, p.name)}><Logo url={logoOf(p.team)} size={24} /><span><b>{p.name}</b><small>{p.number ? `#${p.number} · ` : ''}{p.team}</small></span></Link>;
  return (
    <>
      <div className="wrap"><Crumbs items={[['Home', '/'], ['Circuit', BASE], ['Stats', '']]} /></div>
      <section className="sec" style={{ paddingTop: 24 }}><div className="wrap">
        <div className="page-head" style={{ paddingTop: 0 }}><p className="kicker">{ctx.siteName.replace(/\s+Sport$/, '')} Circuit</p><h1>Season leaders.</h1></div>
        {divs.length > 1 && <div className="tabs" style={{ marginTop: 20 }}>{divs.map((d) => <Link key={d} href={`${BASE}/stats?division=${encodeURIComponent(d)}`} className="tab" role="button" aria-pressed={d === sel}>{d}</Link>)}</div>}
        <div className="ldr-grid">
          {boards.map((b) => (
            <section key={b.key} className="sched-day">
              <div className="sched-head"><h3>{b.label}</h3><span className="sched-div">{b.unit}</span></div>
              <ol className="ldr-list">{b.rows.map((r, i) => <li key={r.player.slug} className={i === 0 ? 'is-first' : undefined}><span className="rk">{i + 1}</span><PlayerCell p={r.player} /><span className="ldr-v">{r.value}{b.key === 'fg' || b.key === 'ft' ? '%' : ''}</span></li>)}</ol>
            </section>
          ))}
        </div>
        {highs.length > 0 && (
          <>
            <h2 style={{ margin: '48px 0 16px' }}>Season highs.</h2>
            <div className="ldr-grid">
              {highs.map((h) => (
                <section key={h.label} className="sched-day">
                  <div className="sched-head"><h3>{h.label}</h3></div>
                  <ol className="ldr-list">{h.rows.map((r, i) => <li key={`${r.player.slug}-${r.game.gameId}`}><span className="rk">{i + 1}</span><PlayerCell p={r.player} /><Link className="ldr-v" href={`${BASE}/games/${r.game.gameId}`} title={`vs ${r.game.opponent}`}>{r.value}</Link></li>)}</ol>
                </section>
              ))}
            </div>
          </>
        )}
        <h2 style={{ margin: '48px 0 16px' }}>Teams.</h2>
        <section className="sched-day box">
          <div className="sched-head"><h3>{sel}</h3><span className="sched-div">Per game</span></div>
          <div className="tbl-wrap"><table className="box-table">
            <thead><tr><th scope="col">Team</th><th scope="col" className="num">GP</th><th scope="col" className="num">PTS</th><th scope="col" className="num">OPP</th><th scope="col" className="num">REB</th><th scope="col" className="num">AST</th><th scope="col" className="num">STL</th><th scope="col" className="num">TO</th><th scope="col" className="num">FG%</th><th scope="col" className="num">3P%</th><th scope="col" className="num">FT%</th></tr></thead>
            <tbody>{teamRows.filter((t) => t.division === sel).map((t) => <tr key={t.slug}><td className="team"><Link className="scorer-nm" href={teamHref(t.division, t.team)}><Logo url={logoOf(t.team)} size={24} />{t.team}</Link></td><td className="num">{t.gp}</td><td className="num"><b>{t.ppg}</b></td><td className="num">{t.oppPpg}</td><td className="num">{t.rpg}</td><td className="num">{t.apg}</td><td className="num">{t.spg}</td><td className="num">{t.tpg}</td><td className="num">{pctText(t.fgPct)}</td><td className="num">{pctText(t.tpPct)}</td><td className="num">{pctText(t.ftPct)}</td></tr>)}</tbody>
          </table></div>
        </section>
        <Credit show={fromSuperstat} />
        <p style={{ marginTop: 28 }}><Link className="pill pill--line pill--sm" href={`${BASE}#schedule`}>Schedule and results</Link></p>
      </div></section>
    </>
  );
}

export async function TeamStatsPage({ ctx, leagueSlug, slug }: { ctx: Ctx; leagueSlug: string; slug: string }) {
  const { games, players, teamRows, logoOf, fromSuperstat, lines, reels } = await load(ctx, leagueSlug);
  const team = teamRows.find((t) => t.slug === slug);
  if (!team) notFound();
  const roster = players.filter((p) => p.team === team.team && p.division === team.division);
  const statIds = new Set(lines.map((l) => l.gameId));
  const played = games.filter((g) => g.division === team.division && (g.home === team.team || g.away === team.team) && g.homeScore != null && g.awayScore != null).sort((a, b) => (b.startsAt ?? '').localeCompare(a.startsAt ?? ''));
  const withStats = played.filter((g) => statIds.has(g.id)).map((g) => g.id);
  const [ins, shots] = await Promise.all([insightsFor(ctx.brandKey, withStats), shotEvents(ctx.brandKey, withStats, team.team)]);
  const mine = ins.filter((i) => i.team === team.team);
  return (
    <>
      <div className="wrap"><Crumbs items={[['Home', '/'], ['Circuit', BASE], ['Stats', `${BASE}/stats?division=${encodeURIComponent(team.division)}`], [team.team, '']]} /></div>
      <section className="sec" style={{ paddingTop: 24 }}><div className="wrap">
        <div className="sched-day game-card">
          <div className="sched-head box-head"><h3><Logo url={logoOf(team.team)} size={36} />{team.team}</h3><span className="sched-div">{team.division} · {team.w}-{team.l}</span></div>
          <Tiles items={[['Points', team.ppg], ['Allowed', team.oppPpg], ['Rebounds', team.rpg], ['Assists', team.apg], ['Steals', team.spg], ['Turnovers', team.tpg], ['FG%', pctText(team.fgPct)], ['3P%', pctText(team.tpPct)], ['FT%', pctText(team.ftPct)]]} />
          <p className="tiles-note">Per game, {team.gp} game{team.gp === 1 ? '' : 's'} with stats.</p>
        </div>
        <div className="sched-list" style={{ marginTop: 28 }}>
          <section className="sched-day box">
            <div className="sched-head"><h3>Players</h3><span className="sched-div">Per game</span></div>
            <div className="tbl-wrap"><table className="box-table">
              <thead><tr><th scope="col">Player</th><th scope="col" className="num">GP</th><th scope="col" className="num">PTS</th><th scope="col" className="num">REB</th><th scope="col" className="num">AST</th><th scope="col" className="num">STL</th><th scope="col" className="num">BLK</th><th scope="col" className="num">FG%</th><th scope="col" className="num">3P%</th><th scope="col" className="num">FT%</th></tr></thead>
              <tbody>{roster.map((p) => <tr key={p.slug}><td className="team"><Link className="scorer-nm" href={playerHref(p.division, p.team, p.number, p.name)}>{p.number && <span className="scorer-no">#{p.number}</span>}{p.name}</Link></td><td className="num">{p.gp}</td><td className="num"><b>{p.ppg}</b></td><td className="num">{p.rpg}</td><td className="num">{p.apg}</td><td className="num">{p.spg}</td><td className="num">{p.bpg}</td><td className="num">{pctText(p.fgPct)}</td><td className="num">{pctText(p.tpPct)}</td><td className="num">{pctText(p.ftPct)}</td></tr>)}</tbody>
            </table></div>
          </section>
          {shots.length > 0 && <section className="sched-day"><div className="sched-head"><h3>Shot map</h3><span className="sched-div">Season</span></div><div className="chart-pad"><ShotChart shots={shots} label={team.team} /></div></section>}
          <section className="sched-day">
            <div className="sched-head"><h3>Games</h3><span className="sched-div">{played.length} played</span></div>
            {played.map((g) => {
              const i = mine.find((x) => x.gameId === g.id);
              const head = <><span className="pbp-t">{fmtDay(g.startsAt)}</span><span className="tg-opp">{g.home === team.team ? 'vs' : 'at'} {g.home === team.team ? g.away : g.home}</span><b>{resultOf(g, team.team)}</b>{statIds.has(g.id) && <Link className="pill pill--line pill--sm" href={`${BASE}/games/${g.id}`}>Full stats</Link>}{statIds.has(g.id) && reels.get(g.id) && <a className="pill pill--red pill--sm" href={`${reels.get(g.id)}?team=${encodeURIComponent(team.team)}`}>Team reel</a>}</>;
              return i ? <details key={g.id} className="team-game"><summary>{head}<span className="sched-chev" aria-hidden="true">▾</span></summary><InsightsBlock ins={i} /></details> : <div key={g.id} className="team-game"><div className="tg-row">{head}</div></div>;
            })}
          </section>
        </div>
        <Credit show={fromSuperstat} />
        <p style={{ marginTop: 28 }}><Link className="pill pill--line pill--sm" href={`${BASE}/stats?division=${encodeURIComponent(team.division)}`}>Season leaders</Link></p>
      </div></section>
    </>
  );
}

export async function PlayerStatsPage({ ctx, leagueSlug, slug }: { ctx: Ctx; leagueSlug: string; slug: string }) {
  const { players, logoOf, fromSuperstat, reels } = await load(ctx, leagueSlug);
  const p = players.find((x) => x.slug === slug);
  if (!p) notFound();
  const shots = p.number ? await shotEvents(ctx.brandKey, p.log.map((g) => g.gameId), p.team, p.number) : [];
  const hasReel = Boolean(p.number) && p.log.some((g) => reels.get(g.gameId));
  const sh = (m: number | null, a: number | null) => (m == null || a == null ? '–' : `${m}-${a}`);
  return (
    <>
      <div className="wrap"><Crumbs items={[['Home', '/'], ['Circuit', BASE], [p.team, teamHref(p.division, p.team)], [p.name, '']]} /></div>
      <section className="sec" style={{ paddingTop: 24 }}><div className="wrap">
        <div className="sched-day game-card">
          <div className="sched-head box-head"><h3>{p.number && <span className="player-no">#{p.number}</span>}{p.name}</h3><Link className="sched-div player-team" href={teamHref(p.division, p.team)}><Logo url={logoOf(p.team)} size={24} />{p.team} · {p.division}</Link></div>
          <Tiles items={[['Points', p.ppg], ['Rebounds', p.rpg], ['Assists', p.apg], ['Steals', p.spg], ['Blocks', p.bpg], ['FG%', pctText(p.fgPct)], ['3P%', pctText(p.tpPct)], ['FT%', pctText(p.ftPct)], ['Games', p.gp]]} />
          <p className="tiles-note">Per game. Season highs: {p.high.pts} points, {p.high.reb} rebounds, {p.high.ast} assists.</p>
        </div>
        <div className="sched-list" style={{ marginTop: 28 }}>
          <section className="sched-day box">
            <div className="sched-head"><h3>Game log</h3><span className="sched-div">{p.gp} game{p.gp === 1 ? '' : 's'}</span></div>
            <div className="tbl-wrap"><table className="box-table">
              <thead><tr><th scope="col">Game</th><th scope="col">Result</th><th scope="col" className="num">PTS</th><th scope="col" className="num">REB</th><th scope="col" className="num">AST</th><th scope="col" className="num">STL</th><th scope="col" className="num">BLK</th><th scope="col" className="num">TO</th><th scope="col" className="num">FG</th><th scope="col" className="num">3PT</th><th scope="col" className="num">FT</th>{hasReel && <th scope="col">Reel</th>}</tr></thead>
              <tbody>{p.log.map((g) => <tr key={g.gameId}><td className="team"><Link href={`${BASE}/games/${g.gameId}`}>{fmtDay(g.startsAt)} · {g.home ? 'vs' : 'at'} {g.opponent}</Link></td><td>{g.result}</td><td className="num"><b>{g.line.pts}</b></td><td className="num">{g.line.reb}</td><td className="num">{g.line.ast}</td><td className="num">{g.line.stl ?? '–'}</td><td className="num">{g.line.blk ?? '–'}</td><td className="num">{g.line.tov ?? '–'}</td><td className="num">{sh(g.line.fgm, g.line.fga)}</td><td className="num">{sh(g.line.tpm, g.line.tpa)}</td><td className="num">{sh(g.line.ftm, g.line.fta)}</td>{hasReel && <td>{reels.get(g.gameId) ? <a href={`${reels.get(g.gameId)}?team=${encodeURIComponent(p.team)}&no=${encodeURIComponent(p.number ?? '')}`}>Get reel</a> : ''}</td>}</tr>)}</tbody>
            </table></div>
          </section>
          {shots.length > 0 && <section className="sched-day"><div className="sched-head"><h3>Shot map</h3><span className="sched-div">Season</span></div><div className="chart-pad"><ShotChart shots={shots} label={p.name} /></div></section>}
        </div>
        <Credit show={fromSuperstat} />
        <p style={{ marginTop: 28 }}><Link className="pill pill--line pill--sm" href={`${BASE}/stats?division=${encodeURIComponent(p.division)}`}>Season leaders</Link></p>
      </div></section>
    </>
  );
}
