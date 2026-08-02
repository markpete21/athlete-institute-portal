import Link from 'next/link';
import type { Metadata } from 'next';
import { listDivisions } from '@/lib/compete/compete';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Compete. Athlete Institute — Standings & schedules' };

/** Compete. Portal home — every published division, grouped by program. */
export default async function CompeteHome() {
  const divisions = await listDivisions();

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

      {divisions.length === 0 ? (
        <p className="cs-empty">
          No divisions are published yet. Once a season is underway its standings appear here automatically.
        </p>
      ) : (
        [...groups.entries()].map(([program, g]) => (
          <section key={program} id={g.anchor} className="cs-sec">
            <h2 className="cs-h2">{program}</h2>
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
