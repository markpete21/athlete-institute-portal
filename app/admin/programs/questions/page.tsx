import { listProgramTypes } from '@/lib/programs/programs';
import { getMarketingSourceOptions, listQuestions } from '@/lib/programs/questions';
import { createQuestionAction, saveMarketingSourcesAction, updateQuestionAction } from './actions';

export const dynamic = 'force-dynamic';

const QTYPES = ['short_text', 'long_text', 'single_choice', 'multi_choice', 'number', 'date', 'file', 'size'];

/** Question library + the standardized marketing-source list (Module 4 Stage 2). */
export default async function QuestionsPage() {
  const [questions, types, sources] = await Promise.all([listQuestions(true), listProgramTypes(true), getMarketingSourceOptions()]);
  const typeName = new Map(types.map((t) => [t.id, t.name]));

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <p className="label text-[11px]">Admin · Programs</p>
        <h1 className="text-5xl">Questions<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-body">A reusable library. Mark a question a per-type default and it auto-attaches to new programs of that type.</p>
      </header>

      <section className="card flex flex-col gap-3 p-6">
        <h2 className="text-2xl">“Where did you hear about us?”</h2>
        <p className="text-sm text-body">The one standardized, required question — asked once per registration, applied to all participants. Managed answer list:</p>
        <form action={saveMarketingSourcesAction} className="flex flex-col gap-2">
          <textarea name="options" defaultValue={sources.join('\n')} rows={4} className="input font-mono text-sm" />
          <button type="submit" className="btn-ghost btn-sm self-end">Save list</button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Library</h2>
        {questions.map((q) => (
          <form key={q.id} action={updateQuestionAction} className="card flex flex-col gap-2 p-4">
            <input type="hidden" name="id" value={q.id} />
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1"><label className="field-label">Label</label><input name="label" defaultValue={q.label} className="input text-sm" /></div>
              <div><label className="field-label">Type</label>
                <select name="qtype" defaultValue={q.qtype} disabled className="input text-sm">{QTYPES.map((t) => <option key={t}>{t}</option>)}</select>
              </div>
              <div><label className="field-label">Default for type</label>
                <select name="defaultForTypeId" defaultValue={q.default_for_type_id ?? ''} className="input text-sm">
                  <option value="">(none)</option>
                  {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-1 pb-2 font-mono text-[10px] uppercase text-silver"><input type="checkbox" name="required" defaultChecked={q.required} /> req</label>
              <label className="flex items-center gap-1 pb-2 font-mono text-[10px] uppercase text-silver"><input type="checkbox" name="archived" defaultChecked={q.archived} /> arch</label>
            </div>
            {['single_choice', 'multi_choice', 'size'].includes(q.qtype) && (
              <textarea name="options" defaultValue={q.options.join('\n')} rows={2} placeholder="one option per line" className="input font-mono text-xs" />
            )}
            <input type="hidden" name="helpText" value={q.help_text ?? ''} />
            <button type="submit" className="btn-ghost btn-sm self-end">Save {q.default_for_type_id ? `· default: ${typeName.get(q.default_for_type_id)}` : ''}</button>
          </form>
        ))}

        <form action={createQuestionAction} className="card flex flex-col gap-2 p-4">
          <h3 className="text-lg font-bold">New question</h3>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1"><label className="field-label">Label</label><input name="label" required className="input text-sm" /></div>
            <div><label className="field-label">Type</label>
              <select name="qtype" className="input text-sm">{QTYPES.map((t) => <option key={t}>{t}</option>)}</select>
            </div>
            <div><label className="field-label">Default for type</label>
              <select name="defaultForTypeId" className="input text-sm"><option value="">(none)</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            </div>
            <label className="flex items-center gap-1 pb-2 font-mono text-[10px] uppercase text-silver"><input type="checkbox" name="required" /> req</label>
          </div>
          <textarea name="options" rows={2} placeholder="options (choice/size types), one per line" className="input font-mono text-xs" />
          <button type="submit" className="btn-gold btn-sm self-end">Add question</button>
        </form>
      </section>
    </main>
  );
}
