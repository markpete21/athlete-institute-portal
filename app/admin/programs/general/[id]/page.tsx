import { notFound } from 'next/navigation';
import { torontoLabel } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { listSessions } from '@/lib/programs/dropin';
import { listRescheduleableSessions } from '@/lib/programs/reschedule';
import { addDropInSessionAction, rescheduleAction } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * Admin: General Programs (Module 10). Manage drop-in dated sessions and run the
 * shared reschedule workflow (move w/ conflict check, or postpone to TBD, with
 * per-channel notification toggles).
 */
export default async function GeneralAdminPage({ params }: { params: { id: string } }) {
  const programId = Number(params.id);
  const { data: program } = await supabaseAdmin().from('programs').select('name, tags').eq('id', programId).maybeSingle();
  if (!program) notFound();
  const [sessions, rescheduleable] = await Promise.all([listSessions(programId), listRescheduleableSessions(programId)]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1 border-b border-hairline pb-4">
        <p className="label text-[11px]">General Program</p>
        <h1 className="text-3xl">{program.name}<span style={{ color: 'var(--accent)' }}>.</span></h1>
        {Array.isArray(program.tags) && program.tags.length > 0 && (
          <div className="flex gap-2 pt-1">{program.tags.map((t: string) => <span key={t} className="tag">{t.replace('_', ' ')}</span>)}</div>
        )}
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl">Drop-in dates</h2>
        {sessions.length === 0 && <p className="text-body">No drop-in dates yet.</p>}
        {sessions.map((s) => (
          <div key={s.id} className="card flex items-center justify-between p-3">
            <span className="text-ink">{torontoLabel(s.starts_at)}</span>
            <span className="flex items-center gap-3 text-sm">
              <span>${(s.price_cents / 100).toFixed(2)}</span>
              <span className="tag" style={s.full ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}>
                {s.postponed ? 'TBD' : s.capacity == null ? `${s.taken} in` : `${s.taken}/${s.capacity}`}
              </span>
            </span>
          </div>
        ))}
        <form action={addDropInSessionAction} className="card flex flex-wrap items-end gap-2 p-4">
          <input type="hidden" name="programId" value={programId} />
          <div><label className="field-label">Date</label><input name="date" type="date" required className="input text-sm" /></div>
          <div><label className="field-label">Start</label><input name="start" type="time" required className="input text-sm" /></div>
          <div><label className="field-label">End</label><input name="end" type="time" required className="input text-sm" /></div>
          <div><label className="field-label">Capacity</label><input name="capacity" type="number" min="1" placeholder="∞" className="input w-20 text-sm" /></div>
          <div><label className="field-label">Price $</label><input name="price" type="number" min="0" step="0.01" defaultValue="15" className="input w-24 text-sm" /></div>
          <button className="btn-gold btn-sm">Add date</button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl">Reschedule a session</h2>
        <p className="text-body text-sm">Move a session to a new time (conflict-checked), or postpone it to be rescheduled later. Registrants are notified on the channels you leave on. No money impact.</p>
        {rescheduleable.length === 0 && <p className="text-body">No sessions to reschedule.</p>}
        {rescheduleable.map((s) => (
          <form key={`${s.kind}-${s.id}`} action={rescheduleAction} className="card flex flex-wrap items-end gap-2 p-4">
            <input type="hidden" name="programId" value={programId} />
            <input type="hidden" name="sessionId" value={s.id} />
            <input type="hidden" name="kind" value={s.kind} />
            <div className="min-w-[10rem] grow">
              <span className="field-label">Session</span>
              <p className="text-ink">{s.label}{s.postponed ? ' · TBD' : ''}</p>
            </div>
            <div><label className="field-label">New date</label><input name="newDate" type="date" className="input text-sm" /></div>
            <div><label className="field-label">Start</label><input name="newStart" type="time" className="input text-sm" /></div>
            <div><label className="field-label">End</label><input name="newEnd" type="time" className="input text-sm" /></div>
            <div className="flex items-center gap-3 pb-2 text-sm">
              <label className="flex items-center gap-1"><input type="checkbox" name="ch_email" defaultChecked /> Email</label>
              <label className="flex items-center gap-1"><input type="checkbox" name="ch_sms" defaultChecked /> Text</label>
              <label className="flex items-center gap-1"><input type="checkbox" name="ch_push" defaultChecked /> Push</label>
            </div>
            <button className="btn-ghost btn-sm">Reschedule</button>
          </form>
        ))}
        <p className="text-body text-xs">Leave the new date blank to postpone (TBD). Fill it in to move the session.</p>
      </section>
    </main>
  );
}
