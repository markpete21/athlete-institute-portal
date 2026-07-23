import Link from 'next/link';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createDivisionAction } from './actions';

export const dynamic = 'force-dynamic';

/** Competitive Play admin: divisions per program (Module 6 Stage 1). */
export default async function CompetitivePage() {
  const db = supabaseAdmin();
  const [{ data: divisions }, { data: programs }] = await Promise.all([
    db.from('divisions').select('id, name, sport, programs(name)').order('id', { ascending: false }),
    db.from('programs').select('id, name').in('status', ['draft', 'published', 'registration_open', 'full']).order('name'),
  ]);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <p className="label text-[11px]">Admin · Competitive Play</p>
        <h1 className="text-5xl">Competition<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-body">Divisions, team builder, schedule builder, score entry, standings.</p>
      </header>

      <section className="card flex flex-col gap-3 p-6">
        <h2 className="text-2xl">New division</h2>
        <form action={createDivisionAction} className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2"><label className="field-label">Program</label>
            <select name="programId" required className="input">{(programs ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </div>
          <div><label className="field-label">Name</label><input name="name" required placeholder="U14 Div A" className="input" /></div>
          <div><label className="field-label">Sport</label>
            <select name="sport" className="input"><option value="basketball">Basketball</option><option value="volleyball">Volleyball</option><option value="other">Other</option></select>
          </div>
          <div className="flex gap-2">
            <div><label className="field-label">Max teams</label><input name="maxTeams" type="number" className="input w-20" /></div>
            <div><label className="field-label">Min/team</label><input name="minPlayers" type="number" className="input w-20" /></div>
            <div><label className="field-label">Max/team</label><input name="maxPlayers" type="number" className="input w-20" /></div>
          </div>
          <div className="flex items-end"><button type="submit" className="btn-gold">Create</button></div>
        </form>
      </section>

      <table className="data-table">
        <thead><tr><th>Division</th><th>Program</th><th>Sport</th><th /></tr></thead>
        <tbody>
          {(divisions ?? []).map((d) => (
            <tr key={d.id}>
              <td className="text-ink">{d.name}</td>
              <td>{(d.programs as unknown as { name: string } | null)?.name}</td>
              <td><span className="tag">{d.sport}</span></td>
              <td><Link href={`/competitive/${d.id}`} className="btn-ghost btn-sm">Open</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
