import Link from 'next/link';
import { listSeasons } from '@/lib/seasons/seasons';
import { createSeasonAction, setSeasonArchivedAction, updateSeasonAction } from './actions';

export const dynamic = 'force-dynamic';

const fmt = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const STATUS_STYLE: Record<string, string> = {
  active: 'pill-status pos',
  upcoming: 'pill-status gold',
  ended: 'tag',
  archived: 'tag opacity-70',
  undated: 'tag',
};

/**
 * The season list every program form draws from (migration 0055). Dates
 * drive status automatically; archiving hides a season from new-program
 * forms without touching the programs already on it.
 */
export default async function SeasonsPage() {
  const seasons = await listSeasons({ includeArchived: true });

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-14">
      <header className="flex flex-col gap-2 border-b border-hairline pb-5">
        <p className="label text-[11px]">Admin · Programs · Seasons</p>
        <h1 className="text-4xl">Seasons<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-body max-w-[62ch] text-sm">
          One list, used everywhere a season appears — program builder, filters, Compete.
          Status follows the dates on its own; archive a season to retire it from new
          programs while its history stays put.
        </p>
      </header>

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-2xl">Add a season</h2>
        <form action={createSeasonAction} className="flex flex-wrap items-end gap-3">
          <div><label className="field-label">Name</label><input name="name" required placeholder="Winter 2027" className="input" /></div>
          <div><label className="field-label">Starts</label><input name="startsOn" type="date" className="input" /></div>
          <div><label className="field-label">Ends</label><input name="endsOn" type="date" className="input" /></div>
          <div><label className="field-label">Key (optional)</label><input name="key" placeholder="2027:jan-apr" className="input w-36" /></div>
          <button type="submit" className="btn-gold btn-sm">Add season</button>
        </form>
        <p className="label text-[10px]">Key defaults from the name and never changes once programs point at it.</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">All seasons</h2>
        {seasons.map((s) => (
          <div key={s.id} className="card flex flex-col gap-2 p-4">
            <form action={updateSeasonAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={s.id} />
              <div><label className="field-label">Name</label><input name="name" defaultValue={s.name} className="input" /></div>
              <div><label className="field-label">Starts</label><input name="startsOn" type="date" defaultValue={s.startsOn ?? ''} className="input" /></div>
              <div><label className="field-label">Ends</label><input name="endsOn" type="date" defaultValue={s.endsOn ?? ''} className="input" /></div>
              <span className={STATUS_STYLE[s.status]}>{s.status.toUpperCase()}</span>
              <span className="label text-[10px]">{s.programCount} PROGRAM{s.programCount === 1 ? '' : 'S'} · {s.key}</span>
              <span className="label text-[10px]">{fmt(s.startsOn)} — {fmt(s.endsOn)}</span>
              <button type="submit" className="btn-ghost btn-sm ml-auto">Save</button>
            </form>
            <form action={setSeasonArchivedAction} className="flex justify-end">
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="archived" value={String(!s.archived)} />
              <button type="submit" className="label text-[10px] hover:text-ink">
                {s.archived ? 'RESTORE' : 'ARCHIVE'}
              </button>
            </form>
          </div>
        ))}
        {seasons.length === 0 && <p className="text-sm text-silver">No seasons yet — add the first above.</p>}
      </section>

      <Link href="/programs" className="label text-[11px] hover:text-ink">← Programs</Link>
    </main>
  );
}
