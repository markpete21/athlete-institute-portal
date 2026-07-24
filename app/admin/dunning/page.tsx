import { formatCAD as money } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { dunningConfig } from '@/lib/dunning/dunning';
import { configAction, explainAction } from './actions';

export const dynamic = 'force-dynamic';

const STEP_LABEL: Record<string, string> = { failed: 'Failed', retried: 'Retried', emailed: 'Emailed', smsed: 'SMS sent', task_created: 'Call task', recovered: 'Recovered', written_off: 'Written off' };

/** Admin: dunning cases + step timing config + team-balance explainer (Module 18). */
export default async function DunningPage() {
  const db = supabaseAdmin();
  const [cfg, { data: cases }, { data: explainers }] = await Promise.all([
    dunningConfig(),
    db.from('dunning_cases').select('id, step, failed_at, families(name), program_installments:installment_id(amount_cents, label)').is('recovered_at', null).order('failed_at'),
    db.from('team_balance_explainers').select('id, division_id, explanation, created_at, divisions(name)').order('id', { ascending: false }).limit(5),
  ]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1 border-b border-hairline pb-4">
        <p className="label text-[11px]">Dunning &amp; Team Explainer</p>
        <h1 className="text-3xl">Payment recovery<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-body text-sm">Failed payments escalate automatically: retry → email → SMS → staff call task + Overdue flag.</p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl">Open cases</h2>
        {(cases ?? []).length === 0 && <p className="text-body text-sm">No open dunning cases. 🎉</p>}
        {(cases ?? []).map((c) => {
          const inst = c.program_installments as unknown as { amount_cents: number; label: string } | null;
          return (
            <div key={c.id} className="card flex items-center justify-between p-3 text-sm">
              <span className="text-ink">{(c.families as unknown as { name: string } | null)?.name ?? 'Unknown'} · {inst?.label} · {money(inst?.amount_cents ?? 0)}</span>
              <span className="tag">{STEP_LABEL[c.step] ?? c.step}</span>
            </div>
          );
        })}
      </section>

      <section className="card flex flex-col gap-2 p-4">
        <h2 className="text-lg">Step timing (days after failure)</h2>
        <form action={configAction} className="flex flex-wrap items-end gap-3">
          <div><label className="field-label">Auto-retry</label><input name="retryAfterDays" type="number" min="0" defaultValue={cfg.retryAfterDays} className="input w-20 text-sm" /></div>
          <div><label className="field-label">Email</label><input name="emailAfterDays" type="number" min="0" defaultValue={cfg.emailAfterDays} className="input w-20 text-sm" /></div>
          <div><label className="field-label">SMS</label><input name="smsAfterDays" type="number" min="0" defaultValue={cfg.smsAfterDays} className="input w-20 text-sm" /></div>
          <div><label className="field-label">Call task</label><input name="taskAfterDays" type="number" min="0" defaultValue={cfg.taskAfterDays} className="input w-20 text-sm" /></div>
          <button className="btn-gold btn-sm">Save</button>
        </form>
        <p className="text-xs text-silver">Messages are editable under Communications → Auto-notifications (dunning.email / dunning.sms / dunning.task).</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl">Team-balance explainer <span className="tag ml-1">admin-private</span></h2>
        <p className="text-body text-sm">Talking points for staff on why the draft balanced teams the way it did. Never shown to families.</p>
        <form action={explainAction} className="card flex items-end gap-2 p-4">
          <div><label className="field-label">Division ID</label><input name="divisionId" type="number" required className="input w-28 text-sm" /></div>
          <button className="btn-ghost btn-sm">Generate talking points</button>
        </form>
        {(explainers ?? []).map((e) => (
          <div key={e.id} className="card p-4 text-sm">
            <p className="field-label">{(e.divisions as unknown as { name: string } | null)?.name ?? `Division ${e.division_id}`}</p>
            <p className="text-body">{e.explanation}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
