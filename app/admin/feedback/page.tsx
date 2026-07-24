import { supabaseAdmin } from '@ai/foundation/supabase';
import { attributedResponses, programRating } from '@/lib/feedback/feedback';
import { configureRoundsAction, summarizeAction, togglePublicAction } from './actions';

export const dynamic = 'force-dynamic';

/** Admin: Feedback & Ratings (Module 15) - ratings, responses, summaries, rounds. */
export default async function FeedbackAdminPage() {
  const db = supabaseAdmin();
  const { data: programs } = await db
    .from('programs')
    .select('id, name, rating_public, program_types(name)')
    .in('status', ['registration_open', 'published', 'full', 'in_progress', 'completed'])
    .order('id', { ascending: false })
    .limit(25);

  const rows = await Promise.all((programs ?? []).map(async (p) => ({
    ...p,
    rating: await programRating(p.id),
    responses: await attributedResponses(p.id),
    summary: (await db.from('feedback_summaries').select('summary, created_at').eq('program_id', p.id).order('id', { ascending: false }).limit(1).maybeSingle()).data,
  })));

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1 border-b border-hairline pb-4">
        <p className="label text-[11px]">Feedback &amp; Ratings</p>
        <h1 className="text-3xl">Feedback<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-body text-sm">Low scores (1–2★) alert staff automatically. Ratings are private unless toggled public.</p>
      </header>

      <div className="flex flex-col gap-4">
        {rows.map((p) => (
          <div key={p.id} className="card flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-bold text-ink">{p.name}</p>
                <p className="text-xs text-silver">{(p.program_types as unknown as { name: string } | null)?.name}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="tag" style={p.rating.average != null && p.rating.average <= 2.5 ? { color: '#b4483c', borderColor: '#b4483c' } : undefined}>
                  {p.rating.average != null ? `${p.rating.average} ★ · ${p.rating.responses}` : 'no ratings'}
                </span>
                <form action={togglePublicAction}><input type="hidden" name="programId" value={p.id} /><button className="btn-ghost btn-sm">{p.rating_public ? 'Public ✓' : 'Private'}</button></form>
              </div>
            </div>

            {p.responses.length > 0 && (
              <div className="flex flex-col gap-1 border-t border-hairline pt-2 text-sm">
                {p.responses.slice(0, 5).map((r, i) => (
                  <p key={i} className="text-body"><span className="mono">{r.rating}★</span> <span className="font-bold text-ink">{r.respondent}</span>{r.comment ? ` — ${r.comment}` : ''} {r.kind === 'full' && <span className="tag">full</span>}</p>
                ))}
              </div>
            )}

            {p.summary && <p className="border-t border-hairline pt-2 text-sm text-body"><span className="field-label">AI summary</span>{p.summary.summary}</p>}

            <div className="flex gap-2">
              <form action={configureRoundsAction} className="flex items-end gap-2">
                <input type="hidden" name="programId" value={p.id} />
                <div><label className="field-label">Delay (days)</label><input name="delayDays" type="number" min="0" defaultValue="1" className="input w-20 text-sm" /></div>
                <button className="btn-ghost btn-sm">Configure rounds</button>
              </form>
              <form action={summarizeAction}><input type="hidden" name="programId" value={p.id} /><button className="btn-ghost btn-sm">Generate summary</button></form>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-body">No programs yet.</p>}
      </div>
    </main>
  );
}
