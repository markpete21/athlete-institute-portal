import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ECOSYSTEM_LINKS, brandCssVars, resolveBrand } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { divisionStandings } from '@/lib/competitive/competitive';

export const dynamic = 'force-dynamic';

const TZ = 'America/Toronto';
const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' }) : 'TBD';
const fmtTime = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }) : '';

/**
 * Public division portal (Module 6 Stage 6) - standings + schedule/results with
 * the per-game Watch Live -> Watch toggle (flips when a score is saved final).
 */
export default async function LeaguePortalPage({ params }: { params: { id: string } }) {
  const db = supabaseAdmin();
  const divisionId = Number(params.id);
  const { data: div } = await db.from('divisions').select('id, name, sport, programs(name, status, brand_key)').eq('id', divisionId).maybeSingle();
  if (!div) notFound();

  const [{ data: games }, standings] = await Promise.all([
    db.from('games').select('id, round, home_team_id, away_team_id, starts_at, status, home_score, away_score, live_stream_ref').eq('division_id', divisionId).order('starts_at'),
    divisionStandings(divisionId),
  ]);
  const name = (id: number | null) => (id ? standings.teamNames.get(id) ?? 'TBD' : 'TBD');
  const brand = brandCssVars(resolveBrand((div.programs as unknown as { brand_key: string } | null)?.brand_key)) as React.CSSProperties;
  const isVb = standings.sport === 'volleyball';
  const unit = isVb ? 'S' : 'PF';

  const now = Date.now();
  const results = (games ?? []).filter((g) => g.status === 'final');
  const upcoming = (games ?? []).filter((g) => g.status !== 'final');

  return (
    <main style={brand} className="mx-auto flex min-h-screen max-w-4xl flex-col gap-10 px-6 py-14">
      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <p className="label text-[11px]">{(div.programs as unknown as { name: string } | null)?.name}</p>
        <h1 className="text-6xl">{div.name}<span style={{ color: 'var(--accent)' }}>.</span></h1>
      </header>

      {/* Standings */}
      <section className="flex flex-col gap-3">
        <h2 className="text-3xl">Standings</h2>
        <div className="card overflow-x-auto">
          <table className="data-table min-w-[560px]">
            <thead><tr><th>#</th><th>Team</th><th>GP</th><th>W</th><th>L</th><th>Win%</th><th>{unit}</th><th>Diff</th><th>Strk</th></tr></thead>
            <tbody>
              {standings.standings.map((r, i) => (
                <tr key={r.team}>
                  <td className="mono text-silver">{i + 1}</td>
                  <td className="font-bold text-ink">{standings.teamNames.get(r.team)}</td>
                  <td className="mono">{r.gp}</td><td className="mono">{r.w}</td><td className="mono">{r.l}</td>
                  <td className="mono">{r.winPct.toFixed(3)}</td><td className="mono">{r.pf}</td>
                  <td className="mono">{r.diff > 0 ? `+${r.diff}` : r.diff}</td><td className="mono">{r.streak}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Schedule + results */}
      <section className="flex flex-col gap-3">
        <h2 className="text-3xl">Schedule &amp; results</h2>
        <div className="flex flex-col gap-2">
          {[...results, ...upcoming].map((g) => {
            const started = g.starts_at && Date.parse(g.starts_at) <= now;
            return (
              <div key={g.id} className="card flex items-center gap-4 p-4">
                <span className="label w-24 shrink-0 text-[10px]">{fmtDate(g.starts_at)}<br />{fmtTime(g.starts_at)}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-ink">{name(g.home_team_id)}</span>
                    <span className="mono text-ink">{g.status === 'final' ? g.home_score : ''}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-ink">{name(g.away_team_id)}</span>
                    <span className="mono text-ink">{g.status === 'final' ? g.away_score : ''}</span>
                  </div>
                </div>
                {g.status === 'final' ? (
                  <a href={g.live_stream_ref ?? ECOSYSTEM_LINKS.live} target="_blank" className="btn-ghost btn-sm">Watch</a>
                ) : started ? (
                  <a href={ECOSYSTEM_LINKS.live} target="_blank" className="btn-gold btn-sm">● Watch Live</a>
                ) : (
                  <span className="tag">Upcoming</span>
                )}
              </div>
            );
          })}
          {(games ?? []).length === 0 && <p className="text-body">Schedule to be announced.</p>}
        </div>
      </section>

      <Link href="/leagues" className="label text-[11px] hover:text-ink">← All competitions</Link>
    </main>
  );
}
