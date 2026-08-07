import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Crest from '@/components/compete/crest';
import { divisionDetail, playerProfile } from '@/lib/compete/compete';

export const dynamic = 'force-dynamic';

const TZ = 'America/Toronto';
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' }) : 'TBD';

/**
 * Public player profile — stats-centric on purpose. The name arrives already
 * masked by lib/compete (same rule as the roster that linked here), the page
 * only exists while the division's stats platform is on, and there is no
 * photo/bio until a family-consent flow ships. Position, height and the rest
 * of the Duke-style info band wait on that same consent work.
 */
export async function generateMetadata({ params }: { params: { id: string; pid: string } }): Promise<Metadata> {
  const p = await playerProfile(Number(params.id), Number(params.pid));
  if (!p) return {};
  return { title: `${p.name} · ${p.teamName} — Compete. Athlete Institute` };
}

export default async function PlayerPage({ params }: { params: { id: string; pid: string } }) {
  const divisionId = Number(params.id);
  const [profile, detail] = await Promise.all([
    playerProfile(divisionId, Number(params.pid)),
    divisionDetail(divisionId),
  ]);
  if (!profile || !detail) notFound();

  const tiles: [string, string][] = [
    ['GP', String(profile.gp)],
    ['PPG', profile.ppg.toFixed(1)],
    ['RPG', profile.rpg.toFixed(1)],
    ['APG', profile.apg.toFixed(1)],
  ];

  return (
    <>
      <div className="cs-head">
        <Link href={`/${divisionId}`} className="label text-[11px]">← {detail.division.name}</Link>
        <div className="cs-pp-head">
          <Crest name={profile.teamName} />
          <div>
            {/* No brand dot here — masked names already end in a period. */}
            <h1 className="cs-h1 cs-pp-name">{profile.name}</h1>
            <p className="label text-[11px]">{profile.teamName} · {detail.division.name}{detail.division.programName ? ` · ${detail.division.programName}` : ''}</p>
          </div>
        </div>
      </div>

      <section className="cs-sec">
        <div className="cs-pp-tiles">
          {tiles.map(([k, v]) => (
            <div key={k} className="cs-pp-tile">
              <span className="v mono">{v}</span>
              <span className="k">{k}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="cs-sec">
        <h2 className="cs-h2">Game log</h2>
        {profile.log.length === 0 ? (
          <p className="cs-empty">Game-by-game lines appear here as staff enter box scores.</p>
        ) : (
          <div className="cs-tablewrap">
            <table className="cs-table">
              <thead><tr><th>Date</th><th>Opponent</th><th>Result</th><th>PTS</th><th>REB</th><th>AST</th></tr></thead>
              <tbody>
                {profile.log.map((g) => (
                  <tr key={g.gameId}>
                    <td>{fmtDate(g.startsAt)}</td>
                    <td className="cs-team">{g.opponent}</td>
                    <td className="mono">{g.result}{g.overtime ? ' OT' : ''}</td>
                    <td className="mono">{g.pts}</td>
                    <td className="mono">{g.reb}</td>
                    <td className="mono">{g.ast}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="cs-note">Stats are entered by league staff after each game. Names follow this division&apos;s privacy setting.</p>
      </section>
    </>
  );
}
