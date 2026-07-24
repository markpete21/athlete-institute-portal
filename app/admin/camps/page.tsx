import Link from 'next/link';
import { supabaseAdmin } from '@ai/foundation/supabase';

export const dynamic = 'force-dynamic';

/** Camps admin index: camp-type programs. */
export default async function CampsPage() {
  const db = supabaseAdmin();
  const { data: types } = await db.from('program_types').select('id').eq('key', 'camp');
  const typeId = types?.[0]?.id;
  const { data: camps } = typeId
    ? await db.from('programs').select('id, name, status, brand_key').eq('program_type_id', typeId).order('id', { ascending: false })
    : { data: [] as { id: number; name: string; status: string; brand_key: string }[] };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <p className="label text-[11px]">Admin · Camps</p>
        <h1 className="text-5xl">Camps<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-body">Create a camp in <Link href="/programs" className="text-gold">Programs</Link> (type “Camp”), then manage its weeks + check-in here.</p>
      </header>
      <table className="data-table">
        <thead><tr><th>Camp</th><th>Brand</th><th>Status</th><th /></tr></thead>
        <tbody>
          {(camps ?? []).map((c) => (
            <tr key={c.id}><td className="text-ink">{c.name}</td><td>{c.brand_key}</td><td><span className="tag">{c.status.replace('_', ' ')}</span></td><td><Link href={`/camps/${c.id}`} className="btn-ghost btn-sm">Weeks</Link></td></tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
