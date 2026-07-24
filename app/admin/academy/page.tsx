import Link from 'next/link';
import { supabaseAdmin } from '@ai/foundation/supabase';

export const dynamic = 'force-dynamic';

/** Admin: academies index (Module 12). Academies are seeded/managed by staff. */
export default async function AcademyIndexPage() {
  const { data: academies } = await supabaseAdmin().from('academies').select('id, name').order('name');

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1 border-b border-hairline pb-4">
        <p className="label text-[11px]">Academy</p>
        <h1 className="text-3xl">Academies<span style={{ color: 'var(--accent)' }}>.</span></h1>
      </header>
      <section className="flex flex-col gap-2">
        {(academies ?? []).length === 0 && <p className="text-body">No academies yet.</p>}
        {(academies ?? []).map((a) => (
          <Link key={a.id} href={`/academy/${a.id}`} className="card flex items-center justify-between p-4 hover:border-[var(--accent)]">
            <span className="font-bold text-ink">{a.name}</span>
            <span className="text-silver">→</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
