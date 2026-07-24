import { atRiskList, currentWeights } from '@/lib/retention/retention';
import { actionAction, recomputeAction, weightsAction } from './actions';

export const dynamic = 'force-dynamic';

const LEVEL_COLOR: Record<string, string> = { red: '#b4483c', amber: '#9E8959', green: '#3f7a5b' };
const WEIGHT_LABELS: Record<string, string> = {
  reenrollTiming: 'Re-enroll timing', lowFeedback: 'Low feedback', abandonedCart: 'Abandoned cart',
  paymentFriction: 'Payment friction', emailDisengaged: 'Email disengaged', siblingGap: 'Sibling gap', crossAppTrend: 'Cross-app trend',
};

/**
 * Admin: Retention dashboard (Module 16). INTERNAL-ONLY (PIPEDA) - the at-risk
 * list with person + reasons + one-click actions, plus tunable rule weights.
 */
export default async function RetentionPage() {
  const [flags, weights] = await Promise.all([atRiskList(), currentWeights()]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex items-end justify-between border-b border-hairline pb-4">
        <div>
          <p className="label text-[11px]">Predictive Retention · internal-only</p>
          <h1 className="text-3xl">At-risk families<span style={{ color: 'var(--accent)' }}>.</span></h1>
        </div>
        <form action={recomputeAction}><button className="btn-ghost btn-sm">Recompute flags</button></form>
      </header>

      <section className="flex flex-col gap-3">
        {flags.length === 0 && <p className="text-body">No at-risk families flagged. Recompute to refresh.</p>}
        {flags.map((f) => (
          <div key={f.flagId} className="card flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between">
              <span className="font-bold text-ink">{f.memberName}</span>
              <span className="tag" style={{ color: LEVEL_COLOR[f.level], borderColor: LEVEL_COLOR[f.level] }}>{f.level} · {f.score}</span>
            </div>
            <ul className="flex flex-col gap-1 text-sm text-body">
              {f.reasons.map((r, i) => (
                <li key={i}>• {r.reason} <span className="text-silver">→ {r.suggestedAction}</span></li>
              ))}
            </ul>
            {f.actionTaken ? (
              <p className="text-xs text-silver">Action taken: {f.actionTaken}</p>
            ) : (
              <div className="flex gap-2">
                {(['offer', 'call', 'discount'] as const).map((kind) => (
                  <form key={kind} action={actionAction}>
                    <input type="hidden" name="flagId" value={f.flagId} />
                    <input type="hidden" name="kind" value={kind} />
                    <button className="btn-ghost btn-sm capitalize">{kind === 'offer' ? 'Send offer' : kind === 'call' ? 'Assign call' : 'Apply discount'}</button>
                  </form>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="card flex flex-col gap-2 p-4">
        <h2 className="text-lg">Rule weights <span className="text-xs text-silver">(transparent + tunable — no black box)</span></h2>
        <form action={weightsAction} className="flex flex-wrap items-end gap-3">
          {Object.entries(weights).map(([key, value]) => (
            <div key={key}>
              <label className="field-label">{WEIGHT_LABELS[key] ?? key}</label>
              <input name={key} type="number" min="0" max="100" defaultValue={value} className="input w-20 text-sm" />
            </div>
          ))}
          <button className="btn-gold btn-sm">Save weights</button>
        </form>
        <p className="text-xs text-silver">Red ≥ 50 · Amber ≥ 25. Cross-app + email rules weight the drop-off trend, not the absolute level. PIPEDA: this view is internal-only and never surfaced to families.</p>
      </section>
    </main>
  );
}
