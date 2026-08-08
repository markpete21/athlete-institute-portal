import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { PrintButton } from '@/components/PrintButton';
import { officialSchedules } from '@/lib/competitive/officials';
import { emailOfficialSchedulesAction } from '../../actions';

export const dynamic = 'force-dynamic';

/**
 * Condensed officiating schedules: one block per official - their games only,
 * one line each. This page IS the deliverable: print it for the front desk,
 * or email every official their own block in one click. Nobody reads the full
 * season grid to find their three Saturdays.
 */
export default async function OfficialSchedulesPage({ params }: { params: { id: string } }) {
  const divisionId = Number(params.id);
  const db = supabaseAdmin();
  const { data: div } = await db.from('divisions').select('id, name, programs(name)').eq('id', divisionId).maybeSingle();
  if (!div) notFound();
  const { schedules } = await officialSchedules(divisionId);
  const withGames = schedules.filter((s) => s.lines.length > 0);
  const noEmail = withGames.filter((s) => !s.official.email).length;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-14">
      <header className="flex flex-col gap-2 border-b border-hairline pb-5">
        <p className="label text-[11px]">{(div.programs as unknown as { name: string } | null)?.name} · {div.name}</p>
        <h1 className="text-3xl">Officiating schedules<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <div className="no-print flex flex-wrap items-center gap-3 pt-1">
          <form action={emailOfficialSchedulesAction}>
            <input type="hidden" name="divisionId" value={divisionId} />
            <button type="submit" className="btn-gold btn-sm">Email each official their schedule</button>
          </form>
          <PrintButton />
          {noEmail > 0 && <span className="label text-[10px]">{noEmail} official{noEmail === 1 ? ' has' : 's have'} no email - print or text their block</span>}
        </div>
      </header>

      {withGames.length === 0 && (
        <p className="text-sm text-silver">No assignments yet - book officials from the division page first.</p>
      )}

      <div className="flex flex-col gap-4">
        {withGames.map((s) => (
          <section key={s.official.id} className="card p-4" style={{ breakInside: 'avoid' }}>
            <div className="flex items-baseline justify-between border-b border-hairline pb-2">
              <h2 className="text-xl">{s.official.firstName} {s.official.lastName}</h2>
              <span className="mono text-sm text-silver">{s.lines.length} game{s.lines.length === 1 ? '' : 's'} · ${(s.payCents / 100).toFixed(2)}</span>
            </div>
            <ul className="flex flex-col">
              {s.lines.map((l) => (
                <li key={l.gameId} className="mono flex flex-wrap gap-x-4 border-b border-hairline py-1.5 text-sm last:border-b-0">
                  <span className="w-28 text-ink">{l.dateLabel}</span>
                  <span className="w-20">{l.timeLabel}</span>
                  <span className="w-40 text-silver">{l.facility}</span>
                  <span className="text-ink">{l.matchup}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <Link href={`/competitive/${divisionId}`} className="no-print label text-[11px] hover:text-ink">← Back to division</Link>
      <style>{'@media print { .no-print, .ash-rail, .ash-topbar, .ash-infobar { display: none !important } main { padding: 0 } }'}</style>
    </main>
  );
}
