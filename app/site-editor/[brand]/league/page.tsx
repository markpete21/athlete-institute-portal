import { listPrograms } from '@/lib/site/records';
import { divisionsOf, listGames, standings, type LeagueGame } from '@/lib/site/league';
import { deleteGameAction, saveGameAction } from '../../actions';
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
  const table = standings(games);
  const divs = divisionsOf(games);
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <section className="card flex flex-col gap-4 p-5">
        <div className="card-head"><h2>{league?.name ?? 'League'} · games</h2><span className="card-head-lbl">{games.length} game{games.length === 1 ? '' : 's'} · {divs.length || 1} division{divs.length === 1 ? '' : 's'}</span><span className="ml-auto"><PreviewButton brand={brand} path={`/${slug}`} label="Preview page" /></span></div>
        {leagues.length > 1 && <nav className="seg">{leagues.map((l) => <a key={l.slug} href={`/admin/league?league=${l.slug}`} className={l.slug === slug ? 'on' : ''}>{l.name}</a>)}</nav>}
        {games.length === 0 && <p className="text-body text-sm">No games yet. Add the schedule on the right; enter scores here as games finish and the standings update themselves.</p>}
        <div className="flex flex-col gap-2">
          {games.map((g) => <GameRow key={g.id} brand={brand} g={g} slug={slug} />)}
        </div>
      </section>
      <div className="flex flex-col gap-5">
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
            <input type="hidden" name="status" value="scheduled" />
            <div className="col-span-2"><SubmitButton className="btn-gold btn-sm" pendingLabel="Adding…" doneLabel="Added">Add game</SubmitButton></div>
          </form>
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

function GameRow({ brand, g, slug }: { brand: string; g: LeagueGame; slug: string }) {
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
      </div>
      <div className="flex flex-col gap-1">
        <SubmitButton className="btn-gold btn-sm" pendingLabel="…" doneLabel="Saved">Save</SubmitButton>
        <SubmitButton className="btn-ghost btn-sm" formAction={deleteGameAction} pendingLabel="…" doneLabel="Removed">Delete</SubmitButton>
      </div>
    </form>
  );
}
