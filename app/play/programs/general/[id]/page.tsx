import Link from 'next/link';
import { notFound } from 'next/navigation';
import { torontoLabel } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { getPortalSession } from '@/lib/auth';
import { listSessions } from '@/lib/programs/dropin';
import { buyDropInAction } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * Public drop-in date picker (Module 10 Stage 2), mobile-first: parents pick the
 * specific dates they want and pay per session. Full dates are greyed out.
 * Buying more later keeps them under the same registration.
 */
export default async function DropInPickerPage({ params }: { params: { id: string } }) {
  const programId = Number(params.id);
  const db = supabaseAdmin();
  const { data: program } = await db.from('programs').select('name, description').eq('id', programId).maybeSingle();
  if (!program) notFound();

  const session = await getPortalSession();
  const [sessions, membersRes] = await Promise.all([
    listSessions(programId),
    session.familyId
      ? db.from('family_members').select('id, first_name, last_name').eq('family_id', session.familyId).order('first_name')
      : Promise.resolve({ data: [] as Array<{ id: number; first_name: string; last_name: string }> }),
  ]);
  const members = membersRes.data ?? [];
  const open = sessions.filter((s) => !s.full);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-1 border-b border-hairline pb-4">
        <p className="label text-[11px]">Drop-in</p>
        <h1 className="text-4xl">{program.name}<span style={{ color: 'var(--accent)' }}>.</span></h1>
        {program.description && <p className="text-body text-sm">{program.description}</p>}
      </header>

      {!session.userId ? (
        <p className="text-body">Please <Link href="/sign-in" className="underline">sign in</Link> to pick your dates.</p>
      ) : members.length === 0 ? (
        <p className="text-body">Add a family member in your <Link href="/account" className="underline">account</Link> to register.</p>
      ) : (
        <form action={buyDropInAction} className="flex flex-col gap-5">
          <input type="hidden" name="programId" value={programId} />
          <div>
            <label className="field-label">Who&apos;s attending</label>
            <select name="familyMemberId" required className="input w-full">
              {members.map((m) => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <span className="field-label">Pick your dates</span>
            {sessions.length === 0 && <p className="text-body text-sm">No dates available yet.</p>}
            {sessions.map((s) => (
              <label key={s.id} className={`card flex items-center justify-between gap-3 p-3 ${s.full ? 'opacity-40' : 'cursor-pointer'}`}>
                <span className="flex items-center gap-3">
                  <input type="checkbox" name="sessionIds" value={s.id} disabled={s.full} className="h-5 w-5" />
                  <span className="text-ink">{torontoLabel(s.starts_at)}</span>
                </span>
                <span className="flex items-center gap-2 text-sm">
                  <span>${(s.price_cents / 100).toFixed(2)}</span>
                  {s.full && <span className="tag" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>{s.postponed ? 'TBD' : 'Full'}</span>}
                  {!s.full && s.spots_left != null && s.spots_left <= 3 && <span className="tag">{s.spots_left} left</span>}
                </span>
              </label>
            ))}
          </div>

          <button className="btn-gold w-full" disabled={open.length === 0}>Register for selected dates</button>
          <p className="text-body text-xs">You can come back and add more dates anytime — you&apos;ll stay registered.</p>
        </form>
      )}
    </main>
  );
}
