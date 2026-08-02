import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildTree, DEFAULT_TIEBREAKS, flattenTree, type FacilityNode, type Sport } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import RatingSelect from '@/components/admin/RatingSelect';
import { divisionStandings, rosterWithRatings, TIEBREAK_OPTIONS } from '@/lib/competitive/competitive';
import { buildScheduleAction, generatePlayoffsAction, runBuilderAction, saveCompeteSettingsAction, saveScoreAction, saveTiebreaksAction, setSkillRatingAction } from '../actions';

export const dynamic = 'force-dynamic';

const ATTRS = ['skill', 'age', 'gender', 'experience', 'height'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'TBD';

export default async function DivisionAdminPage({ params }: { params: { id: string } }) {
  const db = supabaseAdmin();
  const divisionId = Number(params.id);
  const { data: div } = await db.from('divisions').select('id, name, sport, tiebreaks, show_on_compete, show_full_names, programs(name)').eq('id', divisionId).maybeSingle();
  if (!div) notFound();

  const [{ data: teams }, { data: members }, { data: games }, { data: facRows }, standings, roster] = await Promise.all([
    db.from('teams').select('id, name').eq('division_id', divisionId).order('sort_order'),
    db.from('team_members').select('id, team_id').eq('division_id', divisionId),
    db.from('games').select('id, round, stage, home_team_id, away_team_id, starts_at, status, home_score, away_score, overtime, live_stream_ref').eq('division_id', divisionId).order('starts_at'),
    db.from('facilities').select('id, parent_id, name, label, sort_order, bookable, deleted_at').is('deleted_at', null),
    divisionStandings(divisionId),
    rosterWithRatings(divisionId),
  ]);
  const ordered = flattenTree(buildTree((facRows ?? []) as FacilityNode[]));
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const rosterCount = (members ?? []).length;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-14">
      <header className="flex flex-col gap-2 border-b border-hairline pb-5">
        <p className="label text-[11px]">Admin · Competitive · #{div.id}</p>
        <h1 className="text-4xl">{div.name}<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <div className="flex gap-2"><span className="tag">{div.sport}</span><span className="tag">{(div.programs as unknown as { name: string } | null)?.name}</span><span className="tag">{rosterCount} registered · {(teams ?? []).length} teams</span></div>
      </header>

      {/* Team builder */}
      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-2xl">Team builder</h2>
        <form action={runBuilderAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="divisionId" value={divisionId} />
          <div><label className="field-label">Teams</label><input name="numTeams" type="number" defaultValue={2} min={1} className="input w-20" /></div>
          <div className="flex items-end gap-3">
            {ATTRS.map((a) => <label key={a} className="flex items-center gap-1 font-mono text-[11px] uppercase text-silver"><input type="checkbox" name="attributes" value={a} defaultChecked={a === 'skill'} /> {a}</label>)}
          </div>
          <button type="submit" className="btn-gold btn-sm">Run balancing draft</button>
        </form>
        <div className="grid gap-3 sm:grid-cols-3">
          {(teams ?? []).map((t) => (
            <div key={t.id} className="border border-hairline p-3">
              <p className="label text-[10px]">{t.name}</p>
              <p className="mono text-2xl text-ink">{(members ?? []).filter((m) => m.team_id === t.id).length}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Schedule builder */}
      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-2xl">Schedule builder (league)</h2>
        <form action={buildScheduleAction} className="grid gap-3 sm:grid-cols-6">
          <input type="hidden" name="divisionId" value={divisionId} />
          <div className="sm:col-span-2"><label className="field-label">Facility</label>
            <select name="facilityId" required className="input text-sm">{ordered.filter((f) => f.bookable).map((f) => <option key={f.id} value={f.id}>{' '.repeat(f.depth * 2)}{f.name}</option>)}</select>
          </div>
          <div><label className="field-label">Start</label><input name="startDate" type="date" required className="input text-sm" /></div>
          <div><label className="field-label">Weekday</label><select name="weekday" className="input text-sm" defaultValue="2">{WD.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></div>
          <div><label className="field-label">Slots</label><input name="timeSlots" defaultValue="18:00,19:00,20:00" className="input text-sm" /></div>
          <div className="flex items-end gap-2">
            <div><label className="field-label">Mins</label><input name="gameMinutes" type="number" defaultValue={60} className="input w-16 text-sm" /></div>
            <div><label className="field-label">Courts</label><input name="numCourts" type="number" defaultValue={2} className="input w-16 text-sm" /></div>
            <label className="flex items-center gap-1 pb-2 font-mono text-[10px] uppercase text-silver"><input type="checkbox" name="doubleRound" /> 2x</label>
          </div>
          <div className="flex items-end sm:col-span-2"><button type="submit" className="btn-gold btn-sm">Generate + publish</button></div>
        </form>
      </section>

      {/* Roster + staff skill ratings (internal only, never public) */}
      {roster.length > 0 && (
        <section className="card flex flex-col gap-3 p-5">
          <h2 className="text-2xl">Roster &amp; skill ratings</h2>
          <p className="text-body max-w-[62ch] text-sm">
            The 1&ndash;5 rating is staff-only and follows the athlete across every program —
            it feeds the team builder so drafts come out even. It never appears anywhere public.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...(teams ?? []), { id: null as number | null, name: 'Unassigned' }].map((t) => {
              const players = roster.filter((r) => r.teamId === t.id);
              if (!players.length) return null;
              return (
                <div key={t.id ?? 'none'} className="border border-hairline p-3">
                  <p className="label mb-2 text-[10px]">{t.name}</p>
                  <ul className="flex flex-col gap-1">
                    {players.map((r) => (
                      <li key={r.memberId} className="flex items-center justify-between gap-2 text-sm text-ink">
                        <span>{r.name}</span>
                        {r.familyMemberId && (
                          <RatingSelect
                            action={setSkillRatingAction}
                            familyMemberId={r.familyMemberId}
                            divisionId={divisionId}
                            value={r.skillRating}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Score entry */}
      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Games</h2>
        {(games ?? []).map((g) => (
          <form key={g.id} action={saveScoreAction} className="card flex flex-wrap items-center gap-2 p-3 text-sm">
            <input type="hidden" name="divisionId" value={divisionId} />
            <input type="hidden" name="gameId" value={g.id} />
            <span className="label text-[10px]">{g.stage === 'playoff' ? 'PO' : 'R'}{g.round} · {fmt(g.starts_at)}</span>
            <span className="text-ink">{teamName.get(g.home_team_id!) ?? '?'} </span>
            <input name="homeScore" type="number" defaultValue={g.home_score ?? ''} className="input w-14 text-sm" />
            <span className="text-silver">vs</span>
            <input name="awayScore" type="number" defaultValue={g.away_score ?? ''} className="input w-14 text-sm" />
            <span className="text-ink">{teamName.get(g.away_team_id!) ?? '?'}</span>
            {/* Reflect what's saved — a bare checkbox here silently cleared OT
                (and the stream ref) on every re-save. */}
            <label className="flex items-center gap-1 font-mono text-[10px] uppercase text-silver"><input type="checkbox" name="overtime" defaultChecked={g.overtime} /> OT</label>
            <span className="tag">{g.status}</span>
            <input name="liveStreamRef" defaultValue={g.live_stream_ref ?? ''} placeholder="Stream ref (Watch link)" className="input w-44 text-sm" />
            <button type="submit" className="btn-ghost btn-sm ml-auto">Save game</button>
          </form>
        ))}
        {(games ?? []).length === 0 && <p className="text-sm text-silver">No games scheduled yet.</p>}
      </section>

      {/* Standings preview */}
      {standings.standings.some((s) => s.gp > 0) && (
        <section className="flex flex-col gap-2">
          <h2 className="text-2xl">Standings</h2>
          <StandingsTable standings={standings} />
        </section>
      )}

      {/* Standings hierarchy — the ordered tiebreaks behind the table above */}
      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-2xl">Standings hierarchy</h2>
        <p className="text-body max-w-[62ch] text-sm">
          Teams are ranked by the first criterion; ties fall through to the next.
          Applies to this division&apos;s table everywhere, including the public site.
        </p>
        <form action={saveTiebreaksAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="divisionId" value={divisionId} />
          {(() => {
            // Show what standings actually use: the saved order, or the
            // sport's default when the division has never been customized.
            const effective = (div.tiebreaks as string[])?.length
              ? (div.tiebreaks as string[])
              : DEFAULT_TIEBREAKS[div.sport as Sport] ?? DEFAULT_TIEBREAKS.other;
            return [1, 2, 3, 4, 5].map((i) => (
              <div key={i}>
                <label className="field-label">{i === 1 ? '1st' : i === 2 ? '2nd' : i === 3 ? '3rd' : `${i}th`}</label>
                <select name={`tb${i}`} defaultValue={effective[i - 1] ?? ''} className="input text-sm">
                  <option value="">—</option>
                  {TIEBREAK_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </div>
            ));
          })()}
          <button type="submit" className="btn-ghost btn-sm">Save order</button>
        </form>
      </section>

      {/* Playoffs — seed from standings, then advance winners round by round */}
      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-2xl">Playoffs</h2>
        {(() => {
          const po = (games ?? []).filter((g) => g.stage === 'playoff');
          const lastRound = po.length ? Math.max(...po.map((g) => g.round ?? 1)) : 0;
          const lastDone = po.filter((g) => (g.round ?? 1) === lastRound).every((g) => g.status === 'final');
          const finalReached = po.some((g) => (g.round ?? 1) === lastRound) && po.filter((g) => (g.round ?? 1) === lastRound).length === 1;
          return (
            <>
              <p className="text-body max-w-[62ch] text-sm">
                {po.length === 0
                  ? 'Seeds the bracket from current standings (1 plays the lowest seed and so on). Game times start as TBD - set them from the games list.'
                  : finalReached
                    ? 'The final has been generated - the bracket is complete.'
                    : lastDone
                      ? `Round ${lastRound} is complete. Generate the next round to pair the winners.`
                      : `Round ${lastRound} is underway - enter its scores, then generate the next round.`}
              </p>
              <form action={generatePlayoffsAction} className="flex items-end gap-3">
                <input type="hidden" name="divisionId" value={divisionId} />
                {po.length === 0 && (
                  <div>
                    <label className="field-label">Teams</label>
                    <select name="numTeams" defaultValue="4" className="input w-20 text-sm">
                      {[2, 4, 8, 16].filter((n) => n <= (teams ?? []).length).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                )}
                {!finalReached && (
                  <button type="submit" className="btn-gold btn-sm">
                    {po.length === 0 ? 'Seed bracket from standings' : 'Generate next round'}
                  </button>
                )}
              </form>
            </>
          );
        })()}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl">Compete. Portal</h2>
          {div.show_on_compete && (
            <a
              href={`${process.env.NEXT_PUBLIC_COMPETE_URL ?? 'https://compete.athleteinstitute.ca'}/${div.id}`}
              target="_blank" rel="noreferrer" className="label text-[11px] hover:text-ink"
            >
              View public page ↗
            </a>
          )}
        </div>
        <p className="text-body max-w-[62ch] text-sm">
          Controls the public site at compete.athleteinstitute.ca — no login required to view it.
          Leagues and clinics show last names as an initial by default; tournaments and rep/club
          divisions show full names. A family can also hide an individual athlete, which always wins.
        </p>
        <form action={saveCompeteSettingsAction} className="card flex flex-wrap items-center gap-5 p-4">
          <input type="hidden" name="divisionId" value={divisionId} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="showOnCompete" defaultChecked={div.show_on_compete} />
            Show this division publicly
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="showFullNames" defaultChecked={div.show_full_names} />
            Full names on public rosters
          </label>
          <span className="label text-[10px]">
            {div.show_full_names ? 'e.g. Ava Peterson' : 'e.g. Ava P.'}
          </span>
          <button className="btn-ghost btn-sm ml-auto">Save</button>
        </form>
      </section>

      <Link href="/competitive" className="label text-[11px] hover:text-ink">← All divisions</Link>
    </main>
  );
}

function StandingsTable({ standings }: { standings: Awaited<ReturnType<typeof divisionStandings>> }) {
  const isVb = standings.sport === 'volleyball';
  const unit = isVb ? 'Sets' : 'Pts';
  return (
    <table className="data-table">
      <thead><tr><th>Team</th><th>GP</th><th>W</th><th>L</th><th>Win%</th><th>{unit}F</th><th>{unit}A</th><th>Diff</th><th>Streak</th><th>GB</th></tr></thead>
      <tbody>
        {standings.standings.map((r) => (
          <tr key={r.team}>
            <td className="text-ink">{standings.teamNames.get(r.team)}</td>
            <td className="mono">{r.gp}</td><td className="mono">{r.w}</td><td className="mono">{r.l}</td>
            <td className="mono">{r.winPct.toFixed(3)}</td><td className="mono">{r.pf}</td><td className="mono">{r.pa}</td>
            <td className="mono">{r.diff > 0 ? `+${r.diff}` : r.diff}</td><td className="mono">{r.streak}</td><td className="mono">{r.gamesBehind}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
