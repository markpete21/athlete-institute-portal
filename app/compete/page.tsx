import Link from 'next/link';
import type { Metadata } from 'next';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { listDivisions } from '@/lib/compete/compete';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Compete. Athlete Institute — Standings & schedules' };

/** Per-location display settings (migration 0057). One location today, so we
 *  read the first configured row; the location switcher lands with location
 *  number two. Auto = simple under 8 published divisions. */
async function displaySettings(divisionCount: number): Promise<{ layout: 'full' | 'simple'; welcome: string | null }> {
  const { data } = await supabaseAdmin()
    .from('compete_location_settings')
    .select('layout_mode, welcome')
    .order('location_id')
    .limit(1)
    .maybeSingle();
  const mode = data?.layout_mode ?? 'auto';
  return {
    layout: mode === 'auto' ? (divisionCount < 8 ? 'simple' : 'full') : (mode as 'full' | 'simple'),
    welcome: data?.welcome ?? null,
  };
}

/** Compete. Portal home — every published division, grouped by program. */
export default async function CompeteHome() {
  const divisions = await listDivisions();
  const display = await displaySettings(divisions.length);

  // Group under program headings; the top-nav program tabs anchor here.
  const groups = new Map<string, { anchor: string; divisions: typeof divisions }>();
  for (const d of divisions) {
    const label = d.programName ?? d.sport;
    const g = groups.get(label) ?? { anchor: `program-${d.programId ?? label}`, divisions: [] };
    g.divisions.push(d);
    groups.set(label, g);
  }

  return (
    <>
      <div className="cs-head">
        <p className="label text-[11px]">Standings &amp; schedules</p>
        <h1 className="cs-h1">Compete<span className="cs-h1-dot">.</span></h1>
        <p className="cs-lede">
          Live standings, schedules and results for every Athlete Institute league, tournament and club division.
          No account needed.
        </p>
      </div>

      {display.welcome && (
        <div className="cs-welcome">
          <p>{display.welcome}</p>
        </div>
      )}

      {divisions.length === 0 ? (
        <p className="cs-empty">
          No divisions are published yet. Once a season is underway its standings appear here automatically.
        </p>
      ) : display.layout === 'simple' ? (
        /* Simple layout: one block per league with its divisions as rows —
           the right shape while the catalogue is small (or forced in admin). */
        [...groups.entries()].map(([program, g]) => (
          <section key={program} id={g.anchor} className="cs-sec">
            <div className="cs-simpleleague">
              <div className="cs-simplehead">
                <h2 className="cs-h2" style={{ margin: 0 }}>{program}</h2>
                {g.divisions[0]?.programId && (
                  <Link href={`/p/${g.divisions[0].programId}`} className="label text-[10px] hover:text-ink">LEAGUE PAGE →</Link>
                )}
              </div>
              {g.divisions.map((d) => (
                <Link key={d.id} href={`/${d.id}`} className="cs-simplerow">
                  <b>{d.name}</b>
                  <span className="label text-[9px]">{d.tournamentMode ? 'TOURNAMENT' : d.sport.toUpperCase()} · {d.teamCount} TEAM{d.teamCount === 1 ? '' : 'S'}</span>
                  <span className="cs-simplego">STANDINGS &amp; SCHEDULE →</span>
                </Link>
              ))}
            </div>
          </section>
        ))
      ) : (
        [...groups.entries()].map(([program, g]) => (
          <section key={program} id={g.anchor} className="cs-sec">
            <div className="cs-simplehead">
              <h2 className="cs-h2">{program}</h2>
              {g.divisions[0]?.programId && (
                <Link href={`/p/${g.divisions[0].programId}`} className="label text-[10px] hover:text-ink">LEAGUE PAGE →</Link>
              )}
            </div>
            <div className="cs-grid">
              {g.divisions.map((d) => (
                <Link key={d.id} href={`/${d.id}`} className="cs-card">
                  <span className="label text-[10px]">{d.tournamentMode ? 'Tournament' : d.sport}</span>
                  <b>{d.name}</b>
                  <span className="cs-card-meta">
                    {d.teamCount} team{d.teamCount === 1 ? '' : 's'} · {d.sport}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
