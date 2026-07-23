import Link from 'next/link';
import { PROGRAM_CATEGORIES } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { BRANDS } from '@ai/foundation';
import { listProgramTypes } from '@/lib/programs/programs';
import { createProgramAction } from './actions';

export const dynamic = 'force-dynamic';

/** Programs list + create (Module 4 Stage 1). */
export default async function ProgramsListPage() {
  const [types, { data: programs }] = await Promise.all([
    listProgramTypes(),
    supabaseAdmin().from('programs').select('id, name, category, status, brand_key, program_type_id').order('id', { ascending: false }).limit(50),
  ]);
  const typeName = new Map(types.map((t) => [t.id, t.name]));

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-hairline pb-6">
        <div>
          <p className="label text-[11px]">Admin · Programs</p>
          <h1 className="text-5xl">Programs<span style={{ color: 'var(--accent)' }}>.</span></h1>
        </div>
        <Link href="/programs/types" className="btn-ghost btn-sm">Manage types</Link>
      </header>

      <section className="card flex flex-col gap-4 p-6">
        <h2 className="text-2xl">New program</h2>
        <form action={createProgramAction} className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="name">Name</label>
            <input id="name" name="name" required placeholder="Saturday Skills Clinic" className="input" />
          </div>
          <div>
            <label className="field-label" htmlFor="programTypeId">Type</label>
            <select id="programTypeId" name="programTypeId" className="input" required>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="category">Category (defaults from type)</label>
            <select id="category" name="category" className="input" defaultValue="">
              <option value="">— use type default —</option>
              {PROGRAM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="brandKey">Brand</label>
            <select id="brandKey" name="brandKey" className="input" defaultValue="athlete-institute">
              {BRANDS.map((b) => <option key={b.key} value={b.key}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="sportTag">Sport</label>
            <input id="sportTag" name="sportTag" placeholder="Basketball" className="input" />
          </div>
          <div className="flex gap-2">
            <div><label className="field-label" htmlFor="minAge">Min age</label><input id="minAge" name="minAge" type="number" className="input w-20" /></div>
            <div><label className="field-label" htmlFor="maxAge">Max age</label><input id="maxAge" name="maxAge" type="number" className="input w-20" /></div>
            <div><label className="field-label" htmlFor="capacity">Cap</label><input id="capacity" name="capacity" type="number" className="input w-20" /></div>
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn-gold">Create</button>
          </div>
        </form>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-2xl">All programs</h2>
        <table className="data-table">
          <thead><tr><th>Program</th><th>Type</th><th>Category</th><th>Brand</th><th>Status</th><th /></tr></thead>
          <tbody>
            {(programs ?? []).map((p) => (
              <tr key={p.id}>
                <td className="text-ink">{p.name}</td>
                <td>{typeName.get(p.program_type_id)}</td>
                <td><span className="tag">{p.category}</span></td>
                <td>{p.brand_key}</td>
                <td><span className="tag">{p.status.replace('_', ' ')}</span></td>
                <td><Link href={`/programs/${p.id}`} className="btn-ghost btn-sm">Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
