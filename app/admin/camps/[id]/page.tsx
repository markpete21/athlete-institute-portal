import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatCAD } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { listWeeks } from '@/lib/camps/camps';
import { createWeekAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function CampWeeksPage({ params }: { params: { id: string } }) {
  const programId = Number(params.id);
  const { data: prog } = await supabaseAdmin().from('programs').select('name').eq('id', programId).maybeSingle();
  if (!prog) notFound();
  const weeks = await listWeeks(programId);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-14">
      <header className="flex flex-col gap-2 border-b border-hairline pb-5">
        <p className="label text-[11px]">Admin · Camps · {prog.name}</p>
        <h1 className="text-4xl">Weeks<span style={{ color: 'var(--accent)' }}>.</span></h1>
      </header>

      {weeks.map((w) => (
        <div key={w.id} className="card flex flex-wrap items-center gap-3 p-4">
          <span className="font-bold text-ink">{w.name}</span>
          <span className="mono text-sm text-body">{w.start_date} → {w.end_date}</span>
          {w.overnight && <span className="tag">overnight</span>}
          <span className="tag">{formatCAD(w.price_cents)}</span>
          <span className="tag">{w.spots_left == null ? 'open' : `${w.spots_left} left`}</span>
          <Link href={`/camps/checkin/${w.id}`} className="btn-ghost btn-sm ml-auto">Check-in tool</Link>
        </div>
      ))}

      <form action={createWeekAction} className="card grid gap-3 p-5 sm:grid-cols-6">
        <input type="hidden" name="programId" value={programId} />
        <div className="sm:col-span-2"><label className="field-label">Name</label><input name="name" required placeholder="Week 1 - Boys 10-12" className="input text-sm" /></div>
        <div><label className="field-label">Start</label><input name="startDate" type="date" required className="input text-sm" /></div>
        <div><label className="field-label">End</label><input name="endDate" type="date" required className="input text-sm" /></div>
        <div className="flex gap-1"><input name="dailyStart" type="time" className="input text-sm" /><input name="dailyEnd" type="time" className="input text-sm" /></div>
        <div className="flex items-end gap-2">
          <div><label className="field-label">Cap</label><input name="capacity" type="number" className="input w-16 text-sm" /></div>
          <div><label className="field-label">$</label><input name="price" className="input w-20 text-sm" /></div>
          <label className="flex items-center gap-1 pb-2 font-mono text-[10px] uppercase text-silver"><input type="checkbox" name="overnight" /> ON</label>
        </div>
        <div className="flex items-end sm:col-span-2"><button type="submit" className="btn-gold btn-sm">Add week</button></div>
      </form>
      <Link href="/camps" className="label text-[11px] hover:text-ink">← All camps</Link>
    </main>
  );
}
