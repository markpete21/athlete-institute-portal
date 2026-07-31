import Link from 'next/link';
import { findConflictPairs } from '@/lib/conflicts';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { torontoDateOf } from '@/lib/schedule-views';
import { cancelSideAction, keepBothAction } from './actions';
import { EditPair, type EditablePairSide } from './EditPair';

const torontoHHMM = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-CA', { timeZone: 'America/Toronto', hour12: false, hour: '2-digit', minute: '2-digit' });

const toSide = (bk: { id: number; title: string; starts_at: string; ends_at: string }): EditablePairSide => ({
  id: bk.id,
  title: bk.title,
  date: torontoDateOf(bk.starts_at),
  start: torontoHHMM(bk.starts_at),
  end: torontoHHMM(bk.ends_at),
});

export const dynamic = 'force-dynamic';

const TZ = 'America/Toronto';
const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-CA', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Conflicts queue (Module 2 Stage 3): every unresolved collision, with the
 * spec's resolve options - override & delete either side, edit (via the
 * schedule, Stage 5), or keep both (acknowledged + reminder email scheduled).
 */
export default async function ConflictsPage() {
  const from = new Date().toISOString();
  const to = new Date(Date.now() + 90 * 86400_000).toISOString();
  const pairs = await findConflictPairs(from, to);

  const facIds = [...new Set(pairs.flatMap((p) => [p.a.facility_id, p.b.facility_id]))];
  const { data: fac } = facIds.length
    ? await supabaseAdmin().from('facilities').select('id, name').in('id', facIds)
    : { data: [] as { id: number; name: string }[] };
  const facName = new Map((fac ?? []).map((f) => [f.id, f.name]));

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <p className="label text-[11px]">Admin · Schedule</p>
        <h1 className="text-5xl">
          Conflicts<span style={{ color: 'var(--accent)' }}>.</span>
        </h1>
        <p className="text-body">
          Collisions never auto-resolve - you decide: cancel one side, edit, or
          keep both (which schedules a reminder so it is not forgotten).
        </p>
      </header>

      {pairs.length === 0 && (
        <p className="text-body">No unresolved conflicts in the next 90 days.</p>
      )}

      <section className="flex flex-col gap-5">
        {pairs.map((p) => (
          <div key={`${p.a.id}:${p.b.id}`} className="card flex flex-col gap-4 p-6" style={{ borderLeft: '3px solid var(--accent)' }}>
            <div className="grid gap-4 sm:grid-cols-2">
              {[p.a, p.b].map((bk) => (
                <div key={bk.id} className="flex flex-col gap-1">
                  {/* the spec's "edit" path: jump to this booking's day on the Gantt */}
                  <Link
                    href={`/schedule?view=day&date=${torontoDateOf(bk.starts_at)}`}
                    className="text-lg font-bold text-ink underline decoration-hairline underline-offset-4 hover:decoration-current"
                    title="Open this day on the schedule to edit"
                  >
                    {bk.title}
                  </Link>
                  <p className="label text-[11px]">{facName.get(bk.facility_id) ?? `facility ${bk.facility_id}`}</p>
                  <p className="mono text-sm text-body">{fmt(bk.starts_at)} – {fmt(bk.ends_at)}</p>
                  <div className="flex gap-2">
                    <span className="tag">{bk.source}</span>
                    <span className="tag" style={bk.status === 'tentative' ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}>
                      {bk.status === 'tentative' ? 'quote hold' : 'confirmed'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {p.hint && (
              <p className="font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: 'var(--accent)' }}>
                Hint <span className="normal-case tracking-normal">— {p.hint}</span>
              </p>
            )}

            <div className="flex flex-wrap items-end gap-3 border-t border-hairline pt-4">
              <EditPair a={toSide(p.a)} b={toSide(p.b)} />
              <form action={cancelSideAction}>
                <input type="hidden" name="loserId" value={p.a.id} />
                <button type="submit" className="btn-ghost btn-sm text-neg">Cancel “{p.a.title}”</button>
              </form>
              <form action={cancelSideAction}>
                <input type="hidden" name="loserId" value={p.b.id} />
                <button type="submit" className="btn-ghost btn-sm text-neg">Cancel “{p.b.title}”</button>
              </form>
              <form action={keepBothAction} className="flex flex-1 items-end gap-2">
                <input type="hidden" name="bookingA" value={p.a.id} />
                <input type="hidden" name="bookingB" value={p.b.id} />
                <input name="note" placeholder="Why keeping both? (optional)" className="input min-w-52 flex-1 text-sm" />
                <button type="submit" className="btn-gold btn-sm">Keep both</button>
              </form>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
