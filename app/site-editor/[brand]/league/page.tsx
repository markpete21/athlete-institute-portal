import { listPrograms } from '@/lib/site/records';
import { divisionsOf, listGames, listPlayers, listTeams, standings, type LeagueGame, type LeaguePlayer } from '@/lib/site/league';
import { clearBoxScoreAction, deleteGameAction, saveBoxScoreAction, saveGameAction, saveRosterAction, saveSuperstatTeamsAction, saveTeamAction, setStatsPublishedAction, setStreamForUpcomingAction } from '../../actions';
import { boxesFor, gameStatsMeta, statLinesByGame, type GameStatsMeta, type StatLine } from '@/lib/site/league-stats';
import { clubTeamsOrNull } from '@/lib/superstat/client';
import { listTeamLinks } from '@/lib/superstat/sync';
import { suggestTeam } from '@/lib/superstat/map';
import { SuperstatSync } from './SuperstatSync';
import { SubmitButton } from '@/app/admin/brands/SubmitButton';
import { PreviewButton } from '../PreviewButton';

export const dynamic = 'force-dynamic';

const TZ = 'America/Toronto';
/** ISO → value for <input type="datetime-local"> in Toronto time. */
function localValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '00';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`;
}
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-CA', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Date TBC');

/**
 * Site-run league (ALL CAN Circuit): enter games, scores and postponements
 * here until the league moves to the Compete portal. The public Circuit page
 * shows the schedule, results and standings from these rows.
 */
export default async function LeaguePage({ params, searchParams }: { params: { brand: string }; searchParams: { league?: string } }) {
  const brand = params.brand;
  const leagues = (await listPrograms(brand)).filter((p) => /rep|league|circuit/i.test(p.leagueType) || /circuit/i.test(p.slug));
  const slug = searchParams.league ?? leagues.find((l) => l.slug === 'circuit')?.slug ?? leagues[0]?.slug ?? 'circuit';
  const league = leagues.find((l) => l.slug === slug);
  const games = await listGames(brand, slug);
  const stats = await statLinesByGame(brand, slug);
  const meta = await gameStatsMeta(brand, slug);
  const [ss, ssLinks] = await Promise.all([clubTeamsOrNull(), listTeamLinks(brand, slug)]);
  const loaded = [...stats.keys()].length, live = [...stats.keys()].filter((id) => meta.get(id)?.published).length;
  const teamRows = await listTeams(brand, slug);
  const players = await listPlayers(brand, slug);
  // Teams per division, as they appear in the schedule (a club fields one roster per division).
  const rosterSlots = [...new Set(games.map((g) => g.division))].sort().map((d) => ({ division: d, teams: [...new Set(games.filter((g) => g.division === d).flatMap((g) => [g.home, g.away]))].sort() }));
  const teamNames = [...new Set([...games.flatMap((g) => [g.home, g.away]), ...teamRows.map((t) => t.name)])].sort();
  const table = standings(games);
  const divs = divisionsOf(games);
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <section className="card flex flex-col gap-4 p-5">
        <div className="card-head"><h2>{league?.name ?? 'League'} · games</h2><span className="card-head-lbl">{games.length} game{games.length === 1 ? '' : 's'} · {divs.length || 1} division{divs.length === 1 ? '' : 's'}</span><span className="ml-auto"><PreviewButton brand={brand} path={`/${slug}`} label="Preview page" /></span></div>
        {leagues.length > 1 && <nav className="seg">{leagues.map((l) => <a key={l.slug} href={`/admin/league?league=${l.slug}`} className={l.slug === slug ? 'on' : ''}>{l.name}</a>)}</nav>}
        {games.length === 0 && <p className="text-body text-sm">No games yet. Add the schedule on the right; enter scores here as games finish and the standings update themselves.</p>}
        <div className="flex flex-col gap-2">
          {games.map((g) => <GameRow key={g.id} brand={brand} g={g} slug={slug} players={players} stats={stats.get(g.id) ?? []} meta={meta.get(g.id) ?? null} />)}
        </div>
      </section>
      <div className="flex flex-col gap-5">
        <section className="card flex flex-col gap-3 p-5">
          <div className="card-head"><h2>Full stats</h2><span className="card-head-lbl">{loaded} game{loaded === 1 ? '' : 's'} loaded · {live} published</span></div>
          <p className="text-body text-xs">Stats are loaded privately (pasted per game, or synced from Superstat) and only show on the public site once published.</p>
          <div className="flex flex-wrap gap-2">
            <form action={setStatsPublishedAction}><input type="hidden" name="brand" value={brand} /><input type="hidden" name="leagueSlug" value={slug} /><input type="hidden" name="published" value="on" /><SubmitButton className="btn-gold btn-sm" pendingLabel="…" doneLabel="Published">Publish all loaded</SubmitButton></form>
            <form action={setStatsPublishedAction}><input type="hidden" name="brand" value={brand} /><input type="hidden" name="leagueSlug" value={slug} /><input type="hidden" name="published" value="" /><SubmitButton className="btn-ghost btn-sm" pendingLabel="…" doneLabel="Hidden">Unpublish all</SubmitButton></form>
          </div>
          <div className="border-t border-hairline pt-3">
            <p className="text-sm font-extrabold">Superstat</p>
            {ss === null ? (
              <p className="text-body text-xs">Not connected. The owner of the league&apos;s Superstat club creates an API key (Settings › API keys) and it goes into the environment as <span className="mono">SUPERSTAT_API_KEY</span>. Until then, paste box scores per game.</p>
            ) : 'error' in ss ? (
              <p className="text-xs" style={{ color: '#b4483c' }}>Connected, but Superstat answered: {ss.error}</p>
            ) : (
              <>
                <p className="text-body text-xs">Connected to <b>{ss.club.name}</b> · {ss.teams.length} team{ss.teams.length === 1 ? '' : 's'}. Syncs hourly; finished games load here unpublished.</p>
                <form action={saveSuperstatTeamsAction} className="mt-2 flex flex-col gap-1">
                  <input type="hidden" name="brand" value={brand} /><input type="hidden" name="leagueSlug" value={slug} />
                  {rosterSlots.flatMap((slot) => slot.teams.map((team) => {
                    const linkRow = ssLinks.find((l) => l.team === team && l.division === slot.division);
                    const guess = linkRow ? null : suggestTeam(team, slot.division, ss.teams);
                    const cur = ss.teams.find((t) => t.id === (linkRow?.superstatTeamId ?? guess?.id));
                    return (
                      <label key={`${slot.division}|${team}`} className="grid grid-cols-[1fr_1fr] items-center gap-2 text-xs">
                        <span>{team} <span className="text-silver">· {slot.division}</span></span>
                        <select name={`map:${slot.division}|${team}`} defaultValue={cur ? `${cur.id}|${cur.name}` : ''} className="input text-xs">
                          <option value="">Not linked</option>
                          {ss.teams.map((t) => <option key={t.id} value={`${t.id}|${t.name}`}>{t.name}</option>)}
                        </select>
                      </label>
                    );
                  }))}
                  <div className="mt-1"><SubmitButton className="btn-ghost btn-sm" pendingLabel="…" doneLabel="Saved">Save team links</SubmitButton></div>
                </form>
                <div className="mt-2"><SuperstatSync brand={brand} leagueSlug={slug} /></div>
              </>
            )}
          </div>
        </section>
        <section className="card flex flex-col gap-3 p-5">
          <div className="card-head"><h2>Rosters</h2><span className="card-head-lbl">{players.length} player{players.length === 1 ? '' : 's'}</span></div>
          <p className="text-body text-xs">One player per line: <span className="mono">23 | Jordan Smith</span>. Shown on the Circuit page under Rosters (full names), and offered when you enter top scorers.</p>
          {rosterSlots.length === 0 && <p className="text-body text-sm">Add games first; each team gets a roster per division it plays in.</p>}
          {rosterSlots.map((slot) => (
            <details key={slot.division} className="rounded border border-hairline p-2">
              <summary className="cursor-pointer text-xs font-bold">{slot.division || 'League'} · {slot.teams.length} teams</summary>
              <div className="mt-2 flex flex-col gap-3">
                {slot.teams.map((team) => {
                  const roster = players.filter((p) => p.team === team && p.division === slot.division);
                  const id = `r-${slot.division}-${team}`.replace(/[^a-z0-9]+/gi, '-');
                  return (
                    <form key={team} action={saveRosterAction} className="flex flex-col gap-1">
                      <input type="hidden" name="brand" value={brand} /><input type="hidden" name="leagueSlug" value={slug} /><input type="hidden" name="team" value={team} /><input type="hidden" name="division" value={slot.division} />
                      <label className="field-label" htmlFor={id}>{team} <span className="text-silver">· {roster.length}</span></label>
                      <textarea id={id} name="roster" rows={Math.min(12, Math.max(3, roster.length + 1))} defaultValue={roster.map((r) => (r.number ? `${r.number} | ${r.name}` : r.name)).join('\n')} className="input mono text-xs" placeholder={'23 | Jordan Smith\n7 | Sam Lee'} />
                      <SubmitButton className="btn-ghost btn-sm self-start" pendingLabel="Saving…" doneLabel="Saved">Save roster</SubmitButton>
                    </form>
                  );
                })}
              </div>
            </details>
          ))}
        </section>
        <section className="card flex flex-col gap-3 p-5">
          <div className="card-head"><h2>Live stream</h2></div>
          <p className="text-body text-xs">One link for every game that hasn&apos;t finished. The schedule shows Watch live in place of Upcoming. Set a different link on a single game below.</p>
          <form action={setStreamForUpcomingAction} className="flex flex-col gap-2">
            <input type="hidden" name="brand" value={brand} /><input type="hidden" name="leagueSlug" value={slug} />
            <label className="field-label" htmlFor="ls-url">Stream link</label>
            <input id="ls-url" name="streamUrl" type="url" className="input text-sm" placeholder="https://www.youtube.com/@…/live" defaultValue={games.find((g) => g.status !== 'final' && g.streamUrl)?.streamUrl ?? ''} />
            <SubmitButton className="btn-ghost btn-sm self-start">Apply to upcoming games</SubmitButton>
          </form>
        </section>
        <section className="card flex flex-col gap-3 p-5">
          <div className="card-head"><h2>Add a game</h2></div>
          <form action={saveGameAction} className="grid grid-cols-2 gap-2">
            <input type="hidden" name="brand" value={brand} /><input type="hidden" name="leagueSlug" value={slug} />
            <div className="col-span-2 flex flex-col"><label className="field-label" htmlFor="ng-when">Date and time (Toronto)</label><input id="ng-when" name="startsAt" type="datetime-local" className="input text-sm" /></div>
            <div className="flex flex-col"><label className="field-label" htmlFor="ng-div">Division</label><input id="ng-div" name="division" list="ng-divs" className="input text-sm" placeholder="e.g. U13 Boys" /><datalist id="ng-divs">{divs.map((d) => <option key={d} value={d} />)}</datalist></div>
            <div className="flex flex-col"><label className="field-label" htmlFor="ng-venue">Venue</label><input id="ng-venue" name="venue" className="input text-sm" placeholder="Athlete Institute" /></div>
            <div className="flex flex-col"><label className="field-label" htmlFor="ng-home">Home</label><input id="ng-home" name="home" required className="input text-sm" /></div>
            <div className="flex flex-col"><label className="field-label" htmlFor="ng-away">Away</label><input id="ng-away" name="away" required className="input text-sm" /></div>
            <div className="col-span-2 flex flex-col"><label className="field-label" htmlFor="ng-note">Note</label><input id="ng-note" name="note" className="input text-sm" placeholder="Optional, e.g. Court 2" /></div>
            <div className="col-span-2 flex flex-col"><label className="field-label" htmlFor="ng-stream">Live stream link</label><input id="ng-stream" name="streamUrl" type="url" className="input text-sm" placeholder="Optional, https://…" /></div>
            <input type="hidden" name="status" value="scheduled" />
            <div className="col-span-2"><SubmitButton className="btn-gold btn-sm" pendingLabel="Adding…" doneLabel="Added">Add game</SubmitButton></div>
          </form>
        </section>
        <section className="card flex flex-col gap-3 p-5">
          <div className="card-head"><h2>Teams</h2><span className="card-head-lbl">Logos show on the schedule and standings</span></div>
          {teamNames.map((name) => {
            const t = teamRows.find((x) => x.name === name);
            return (
              <form key={name} action={saveTeamAction} className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
                <input type="hidden" name="brand" value={brand} /><input type="hidden" name="leagueSlug" value={slug} /><input type="hidden" name="name" value={name} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {t?.logoUrl ? <img src={t.logoUrl} alt="" className="h-9 w-9 object-contain" /> : <span className="inline-block h-9 w-9 rounded-full border border-dashed border-hairline" aria-hidden="true" />}
                <span className="min-w-[120px] flex-1 text-sm font-bold">{name}</span>
                <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="input text-xs" aria-label={`Logo for ${name}`} />
                <SubmitButton className="btn-ghost btn-sm" pendingLabel="…" doneLabel="Saved">{t?.logoUrl ? 'Replace' : 'Add logo'}</SubmitButton>
              </form>
            );
          })}
          <p className="text-xs text-silver">PNG with a transparent background, square, 256px or larger.</p>
        </section>
        <section className="card flex flex-col gap-3 p-5">
          <div className="card-head"><h2>Standings</h2><span className="card-head-lbl">From final scores</span></div>
          {table.size === 0 ? <p className="text-body text-sm">Appear once a score is entered.</p> : [...table.entries()].map(([div, rows]) => (
            <div key={div}>
              {div && <p className="label mb-1 text-[10px]">{div}</p>}
              <table className="data-table text-xs"><thead><tr><th>Team</th><th>W</th><th>L</th><th>Diff</th></tr></thead><tbody>{rows.map((r) => <tr key={r.team}><td>{r.team}</td><td>{r.w}</td><td>{r.l}</td><td>{r.diff > 0 ? `+${r.diff}` : r.diff}</td></tr>)}</tbody></table>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function GameRow({ brand, g, slug, players, stats, meta }: { brand: string; g: LeagueGame; slug: string; players: LeaguePlayer[]; stats: StatLine[]; meta: GameStatsMeta | null }) {
  const [hb, ab] = boxesFor(stats, g.home, g.away);
  const boxNote = (b: typeof hb) => (b.lines.length ? `${b.lines.length} players${b.total ? ' + team totals' : ''}` : b.total ? 'team totals only' : 'not uploaded');
  const rosterOf = (team: string) => players.filter((p) => p.team === team && p.division === g.division);
  const home = rosterOf(g.home), away = rosterOf(g.away);
  return (
    <form action={saveGameAction} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded border border-hairline p-3">
      <input type="hidden" name="brand" value={brand} /><input type="hidden" name="id" value={g.id} /><input type="hidden" name="leagueSlug" value={slug} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="col-span-2 flex flex-col"><label className="field-label" htmlFor={`g-${g.id}-when`}>{fmt(g.startsAt)}</label><input id={`g-${g.id}-when`} name="startsAt" type="datetime-local" defaultValue={localValue(g.startsAt)} className="input text-xs" /></div>
        <div className="flex flex-col"><label className="field-label" htmlFor={`g-${g.id}-div`}>Division</label><input id={`g-${g.id}-div`} name="division" defaultValue={g.division} className="input text-xs" /></div>
        <div className="flex flex-col"><label className="field-label" htmlFor={`g-${g.id}-venue`}>Venue</label><input id={`g-${g.id}-venue`} name="venue" defaultValue={g.venue ?? ''} className="input text-xs" /></div>
        <div className="flex flex-col"><label className="field-label" htmlFor={`g-${g.id}-home`}>Home</label><input id={`g-${g.id}-home`} name="home" defaultValue={g.home} className="input text-xs" /></div>
        <div className="flex flex-col"><label className="field-label" htmlFor={`g-${g.id}-hs`}>Home score</label><input id={`g-${g.id}-hs`} name="homeScore" type="number" min={0} defaultValue={g.homeScore ?? ''} className="input text-xs" /></div>
        <div className="flex flex-col"><label className="field-label" htmlFor={`g-${g.id}-away`}>Away</label><input id={`g-${g.id}-away`} name="away" defaultValue={g.away} className="input text-xs" /></div>
        <div className="flex flex-col"><label className="field-label" htmlFor={`g-${g.id}-as`}>Away score</label><input id={`g-${g.id}-as`} name="awayScore" type="number" min={0} defaultValue={g.awayScore ?? ''} className="input text-xs" /></div>
        <div className="flex flex-col"><label className="field-label" htmlFor={`g-${g.id}-st`}>Status</label><select id={`g-${g.id}-st`} name="status" defaultValue={g.status} className="input text-xs"><option value="scheduled">Scheduled</option><option value="final">Final</option><option value="postponed">Postponed</option></select></div>
        <div className="col-span-2 flex flex-col sm:col-span-3"><label className="field-label" htmlFor={`g-${g.id}-note`}>Note</label><input id={`g-${g.id}-note`} name="note" defaultValue={g.note ?? ''} className="input text-xs" /></div>
        <div className="col-span-2 flex flex-col sm:col-span-4"><label className="field-label" htmlFor={`g-${g.id}-stream`}>Live stream link</label><input id={`g-${g.id}-stream`} name="streamUrl" type="url" defaultValue={g.streamUrl ?? ''} className="input text-xs" placeholder="https://…" /></div>
        <details className="col-span-2 sm:col-span-4" open={!!g.scorers}>
          <summary className="cursor-pointer text-xs font-bold">Top scorers and player of the game</summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <ScorerInputs gid={g.id} side="home" team={g.home} roster={home} rows={g.scorers?.home ?? []} />
            <ScorerInputs gid={g.id} side="away" team={g.away} roster={away} rows={g.scorers?.away ?? []} />
            <div className="col-span-2 flex flex-col"><label className="field-label" htmlFor={`g-${g.id}-potg`}>Player of the game</label><input id={`g-${g.id}-potg`} name="potg" list={`g-${g.id}-potg-list`} defaultValue={g.scorers?.potg ?? ''} className="input text-xs" placeholder="One of the scorers above; gets the maple leaf" /><datalist id={`g-${g.id}-potg-list`}>{[...home, ...away].map((p) => <option key={p.id} value={p.name} />)}</datalist></div>
          </div>
        </details>
        <details className="col-span-2 sm:col-span-4" open={stats.length > 0}>
          <summary className="cursor-pointer text-xs font-bold">Full stats (box score){stats.length > 0 ? (meta?.published ? ' · published' : ' · loaded, not published') : ''}{meta?.superstatStatus ? ` · Superstat: ${meta.superstatStatus.replace('_', ' ')}` : ''}</summary>
          <p className="mt-1 text-xs text-silver">Paste each team&apos;s box score: the table with its header row (e.g. Superstat&apos;s Player # PTS REB AST … FT%), or the one-line team summary. Players match the roster by jersey number. Uploading replaces that team&apos;s stats for this game. Stats stay private until you publish them; Preview shows them as they will look.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="flex flex-col"><label className="field-label" htmlFor={`g-${g.id}-boxh`}>{g.home} · {boxNote(hb)}</label><textarea id={`g-${g.id}-boxh`} name="boxHome" rows={6} className="input mono text-xs" placeholder={'Player # PTS REB AST STL BLK TO FG FG% 3PT 3P% FT FT%\n#15 15 14 3 2 1 0 1 6-11 54.5 1-4 25.0 1-1 100.0\n…\nTEAM 66 41 13 11 0 22 29-75 38.7 4-20 20.0 4-11 36.4'} /></div>
            <div className="flex flex-col"><label className="field-label" htmlFor={`g-${g.id}-boxa`}>{g.away} · {boxNote(ab)}</label><textarea id={`g-${g.id}-boxa`} name="boxAway" rows={6} className="input mono text-xs" placeholder="Same, or the summary line: 47 PTS FG 19-51 (37.3%) … 20 TO" /></div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <SubmitButton className="btn-gold btn-sm" formAction={saveBoxScoreAction} pendingLabel="Uploading…" doneLabel="Uploaded">Upload full stats</SubmitButton>
            {stats.length > 0 && <><input type="hidden" name="gameId" value={g.id} /><input type="hidden" name="published" value={meta?.published ? '' : 'on'} /><SubmitButton className="btn-ghost btn-sm" formAction={setStatsPublishedAction} pendingLabel="…" doneLabel="Done">{meta?.published ? 'Unpublish stats' : 'Publish stats'}</SubmitButton></>}
            {stats.length > 0 && <SubmitButton className="btn-ghost btn-sm" formAction={clearBoxScoreAction} pendingLabel="…" doneLabel="Cleared">Clear full stats</SubmitButton>}
            {stats.length > 0 && <PreviewButton brand={brand} path={`/circuit/games/${g.id}`} label="Preview full stats" />}
          </div>
        </details>
      </div>
      <div className="flex flex-col gap-1">
        <SubmitButton className="btn-gold btn-sm" pendingLabel="…" doneLabel="Saved">Save</SubmitButton>
        <SubmitButton className="btn-ghost btn-sm" formAction={deleteGameAction} pendingLabel="…" doneLabel="Removed">Delete</SubmitButton>
      </div>
    </form>
  );
}

/** Top five scorers for one side: roster dropdowns + points when the team has a roster, else "Name | points" lines. */
function ScorerInputs({ gid, side, team, roster, rows }: { gid: number; side: 'home' | 'away'; team: string; roster: LeaguePlayer[]; rows: { name: string; pts: number }[] }) {
  if (!roster.length) {
    return <div className="flex flex-col"><label className="field-label" htmlFor={`g-${gid}-${side}5`}>{team}</label><textarea id={`g-${gid}-${side}5`} name={`${side}Scorers`} rows={5} defaultValue={rows.map((r) => `${r.name} | ${r.pts}`).join('\n')} className="input mono text-xs" placeholder={'Name | points\none per line, top five\n(or add a roster)'} /></div>;
  }
  const names = new Set(roster.map((p) => p.name));
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="field-label">{team}</legend>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="grid grid-cols-[1fr_64px] gap-1">
          <select name={`${side}P${i}`} defaultValue={rows[i]?.name ?? ''} className="input text-xs" aria-label={`${team} scorer ${i + 1}`}>
            <option value="">—</option>
            {roster.map((p) => <option key={p.id} value={p.name}>{p.number ? `#${p.number} ` : ''}{p.name}</option>)}
            {rows[i] && !names.has(rows[i].name) && <option value={rows[i].name}>{rows[i].name}</option>}
          </select>
          <input name={`${side}Pts${i}`} type="number" min={0} defaultValue={rows[i]?.pts ?? ''} className="input text-xs" aria-label={`${team} scorer ${i + 1} points`} placeholder="Pts" />
        </div>
      ))}
    </fieldset>
  );
}
