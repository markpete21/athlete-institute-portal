import Link from 'next/link';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createClubAction } from './actions';

export const dynamic = 'force-dynamic';

/** Admin: clubs index (Module 11). */
export default async function ClubIndexPage() {
  const { data: clubs } = await supabaseAdmin().from('clubs').select('id, name, sport').order('name');

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1 border-b border-hairline pb-4">
        <p className="label text-[11px]">Club</p>
        <h1 className="text-3xl">Clubs<span style={{ color: 'var(--accent)' }}>.</span></h1>
      </header>

      <section className="flex flex-col gap-2">
        {(clubs ?? []).length === 0 && <p className="text-body">No clubs yet.</p>}
        {(clubs ?? []).map((c) => (
          <Link key={c.id} href={`/club/${c.id}`} className="card flex items-center justify-between p-4 hover:border-[var(--accent)]">
            <span className="font-bold text-ink">{c.name}</span>
            {c.sport && <span className="tag">{c.sport}</span>}
          </Link>
        ))}
      </section>

      <form action={createClubAction} className="card flex flex-wrap items-end gap-2 p-4">
        <div className="grow"><label className="field-label">Club name</label><input name="name" required placeholder="Bears Volleyball Club" className="input w-full text-sm" /></div>
        <div><label className="field-label">Sport</label><input name="sport" placeholder="volleyball" className="input text-sm" /></div>
        <button className="btn-gold btn-sm">Create club</button>
      </form>
    </main>
  );
}
