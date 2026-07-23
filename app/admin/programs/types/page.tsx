import { PROGRAM_CATEGORIES } from '@ai/foundation';
import { listProgramTypes } from '@/lib/programs/programs';
import { saveTypeAction } from '../actions';

export const dynamic = 'force-dynamic';

const PRORATIONS = ['none', 'league', 'clinic', 'camp', 'dropin'];

/** Program type manager (Module 4 Stage 1) - add/edit types + inherited defaults. */
export default async function ProgramTypesPage() {
  const types = await listProgramTypes(true);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <p className="label text-[11px]">Admin · Programs</p>
        <h1 className="text-5xl">Program types<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-body">Each type seeds a new program&apos;s category and proration method (both overridable per program).</p>
      </header>

      {types.map((t) => (
        <form key={t.id} action={saveTypeAction} className="card flex flex-wrap items-end gap-3 p-4">
          <input type="hidden" name="id" value={t.id} />
          <input type="hidden" name="key" value={t.key} />
          <div className="flex-1">
            <label className="field-label">Name ({t.key})</label>
            <input name="name" defaultValue={t.name} className="input" />
          </div>
          <div>
            <label className="field-label">Default category</label>
            <select name="defaultCategory" defaultValue={t.default_category} className="input text-sm">
              {PROGRAM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Default proration</label>
            <select name="defaultProration" defaultValue={t.default_proration} className="input text-sm">
              {PRORATIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-1 pb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-silver">
            <input type="checkbox" name="active" defaultChecked={t.active} /> active
          </label>
          <button type="submit" className="btn-ghost btn-sm">Save</button>
        </form>
      ))}

      <form action={saveTypeAction} className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="field-label">Key</label>
          <input name="key" required placeholder="e.g. skills" className="input text-sm w-28" />
        </div>
        <div className="flex-1">
          <label className="field-label">Name</label>
          <input name="name" required placeholder="Skills Program" className="input" />
        </div>
        <div>
          <label className="field-label">Category</label>
          <select name="defaultCategory" defaultValue="Youth Sports" className="input text-sm">
            {PROGRAM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Proration</label>
          <select name="defaultProration" defaultValue="none" className="input text-sm">
            {PRORATIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-1 pb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-silver">
          <input type="checkbox" name="active" defaultChecked /> active
        </label>
        <button type="submit" className="btn-gold btn-sm">Add type</button>
      </form>
    </main>
  );
}
