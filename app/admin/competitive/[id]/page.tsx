import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildTree, flattenTree, type FacilityNode } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { divisionStandings } from '@/lib/competitive/competitive';
import { buildScheduleAction, runBuilderAction, saveScoreAction } from '../actions';

export const dynamic = 'force-dynamic';

const ATTRS = ['skill', 'age', 'gender', 'experience', 'height'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'TBD';

export default async function DivisionAdminPage({ params }: { params: { id: string } }) {
  const db = supabaseAdmin();
  const divisionId = Number(params.id);
  const { data: div } = await db.from('divisions').select('id, name, sport, programs(name)').eq('id', divisionId).maybeSingle();
  if (!div) notFound();

  const [{ data: teams }, { data: members }, { data: games }, { data: facRows }, standings] = await Promise.all([
    db.from('teams').select('id, name').eq('division_id', divisionId).order('sort_order'),
    db.from('team_members').select('id, team_id').eq('division_id', divisionId),
    db.from('games').select('id, round, home_team_id, away_team_id, starts_at, status, home_score, away_score').eq('division_id', divisionId).order('starts_at'),
    db.from('facilities').select('id, parent_id, name, label, sort_order, bookable, deleted_at').is('deleted_at', null),
    divisionStandings(divisionId),
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

      {/* Score entry */}
      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Games</h2>
        {(games ?? []).map((g) => (
          <form key={g.id} action={saveScoreAction} className="card flex flex-wrap items-center gap-2 p-3 text-sm">
            <input type="hidden" name="divisionId" value={divisionId} />
            <input type="hidden" name="gameId" value={g.id} />
            <span className="label text-[10px]">R{g.round} · {fmt(g.starts_at)}</span>
            <span className="text-ink">{teamName.get(g.home_team_id!) ?? '?'} </span>
            <input name="homeScore" type="number" defaultValue={g.home_score ?? ''} className="input w-14 text-sm" />
            <span className="text-silver">vs</span>
            <input name="awayScore" type="number" defaultValue={g.away_score ?? ''} className="input w-14 text-sm" />
            <span className="text-ink">{teamName.get(g.away_team_id!) ?? '?'}</span>
            <label className="flex items-center gap-1 font-mono text-[10px] uppercase text-silver"><input type="checkbox" name="overtime" /> OT</label>
            <span className="tag">{g.status}</span>
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
