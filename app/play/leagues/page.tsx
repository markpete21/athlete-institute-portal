import Link from 'next/link';
import { supabaseAdmin } from '@ai/foundation/supabase';

export const dynamic = 'force-dynamic';

/** Public competition portal index (Module 6 Stage 6). */
export default async function LeaguesPage() {
  const db = supabaseAdmin();
  // Divisions whose program is publicly visible.
  const { data: divs } = await db
    .from('divisions')
    .select('id, name, sport, programs(name, status, brand_key)')
    .order('id', { ascending: false });
  const visible = (divs ?? []).filter((d) => ['published', 'registration_open', 'full', 'closed'].includes((d.programs as unknown as { status: string } | null)?.status ?? ''));

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-14">
      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <p className="label text-[11px]">Leagues &amp; Tournaments</p>
        <h1 className="text-6xl">Compete<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-body">Live schedules, results, and standings.</p>
      </header>

      {visible.length === 0 && <p className="text-body">No public competitions yet.</p>}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((d) => {
          const p = d.programs as unknown as { name: string };
          return (
            <Link key={d.id} href={`/leagues/${d.id}`} className="card flex flex-col gap-2 p-5 transition-colors hover:border-ink">
              <span className="label text-[10px]">{p.name}</span>
              <h2 className="text-2xl">{d.name}</h2>
              <span className="tag">{d.sport}</span>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
