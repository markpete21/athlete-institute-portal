import Link from 'next/link';
import { PROGRAM_CATEGORIES, formatCAD } from '@ai/foundation';
import { listProgramTypes } from '@/lib/programs/programs';
import { listPublicPrograms, type CatalogFilters } from '@/lib/programs/catalog';

export const dynamic = 'force-dynamic';

/** Public program catalog (Module 4 Stage 8) with the spec's filters. */
export default async function CatalogPage({ searchParams }: { searchParams: Record<string, string> }) {
  const filters: CatalogFilters = {
    category: (searchParams.category as CatalogFilters['category']) || undefined,
    sport: searchParams.sport || undefined,
    typeKey: searchParams.type || undefined,
    brandKey: searchParams.brand || undefined,
    seasonKey: searchParams.season || undefined,
    age: searchParams.age ? Number(searchParams.age) : undefined,
  };
  const [programs, types] = await Promise.all([listPublicPrograms(filters), listProgramTypes()]);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-14">
      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <p className="label text-[11px]">Programs</p>
        <h1 className="text-5xl">Register<span style={{ color: 'var(--accent)' }}>.</span></h1>
      </header>

      <form method="get" className="card flex flex-wrap items-end gap-3 p-4">
        <div><label className="field-label" htmlFor="category">Category</label>
          <select id="category" name="category" defaultValue={searchParams.category ?? ''} className="input text-sm">
            <option value="">All</option>{PROGRAM_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div><label className="field-label" htmlFor="type">Type</label>
          <select id="type" name="type" defaultValue={searchParams.type ?? ''} className="input text-sm">
            <option value="">All</option>{types.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
          </select>
        </div>
        <div><label className="field-label" htmlFor="sport">Sport</label><input id="sport" name="sport" defaultValue={searchParams.sport ?? ''} className="input text-sm w-28" /></div>
        <div><label className="field-label" htmlFor="age">Age</label><input id="age" name="age" type="number" defaultValue={searchParams.age ?? ''} className="input text-sm w-16" /></div>
        <div><label className="field-label" htmlFor="season">Season</label><input id="season" name="season" defaultValue={searchParams.season ?? ''} placeholder="2026:sep-dec" className="input text-sm w-32" /></div>
        <button type="submit" className="btn-gold btn-sm">Filter</button>
      </form>

      {programs.length === 0 && <p className="text-body">No programs match — try broadening your filters.</p>}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {programs.map((p) => (
          <Link key={p.id} href={`/p/${p.share_token}`} className="card flex flex-col gap-2 p-5 transition-colors hover:border-ink">
            <span className="label text-[10px]">{p.type_name} · {p.category}</span>
            <h2 className="text-2xl">{p.name}</h2>
            {p.sport_tag && <span className="tag">{p.sport_tag}</span>}
            <p className="mono text-ink">{formatCAD(p.base_price_cents)}</p>
            <p className="text-sm text-silver">
              {p.status === 'full' || p.spots_left === 0 ? 'Waitlist' : p.spots_left == null ? 'Open' : `${p.spots_left} spots left`}
              {(p.min_age || p.max_age) && ` · ages ${p.min_age ?? ''}–${p.max_age ?? ''}`}
            </p>
          </Link>
        ))}
      </section>
    </main>
  );
}
