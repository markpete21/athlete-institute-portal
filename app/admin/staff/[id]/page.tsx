import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatCAD } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { absenceAction, addCertAction, addEmailAction, archiveStaffAction, assignAction } from '../actions';

export const dynamic = 'force-dynamic';

const PAY_MODES = ['per_session', 'hourly', 'flat', 'salary'];
const FREQS = ['bi_weekly', 'monthly', 'after_program'];

export default async function StaffDetailPage({ params }: { params: { id: string } }) {
  const db = supabaseAdmin();
  const { data: staff } = await db.from('staff').select('id, first_name, last_name, email, bio, status, profile_id').eq('id', Number(params.id)).maybeSingle();
  if (!staff) notFound();

  const [{ data: assigns }, { data: certs }, { data: programs }] = await Promise.all([
    db.from('staff_assignments').select('id, pay_mode, rate_cents, frequency, active, programs(name)').eq('staff_id', staff.id),
    db.from('staff_certifications').select('id, name, expires_on').eq('staff_id', staff.id),
    db.from('programs').select('id, name').in('status', ['draft', 'published', 'registration_open', 'full']).order('name'),
  ]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-14">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-hairline pb-5">
        <div>
          <p className="label text-[11px]">Admin · Staff · #{staff.id}</p>
          <h1 className="text-4xl">{staff.first_name} {staff.last_name}<span style={{ color: 'var(--accent)' }}>.</span></h1>
          <div className="mt-2 flex gap-2"><span className="tag">{staff.status}</span>{!staff.profile_id && <span className="tag">account-less</span>}</div>
        </div>
        <form action={archiveStaffAction}>
          <input type="hidden" name="staffId" value={staff.id} />
          {staff.status === 'archived' ? <><input type="hidden" name="unarchive" value="on" /><button className="btn-ghost btn-sm">Unarchive</button></> : <button className="btn-ghost btn-sm text-neg">Archive</button>}
        </form>
      </header>

      {staff.bio && <p className="text-body">{staff.bio}</p>}

      {!staff.email && (
        <form action={addEmailAction} className="card flex items-end gap-2 p-4">
          <input type="hidden" name="staffId" value={staff.id} />
          <div className="flex-1"><label className="field-label">Add email (upgrade to a login)</label><input name="email" type="email" required className="input text-sm" /></div>
          <button type="submit" className="btn-gold btn-sm">Add + invite</button>
        </form>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Assignments</h2>
        {(assigns ?? []).map((a) => (
          <div key={a.id} className="card flex flex-wrap items-center gap-3 p-4 text-sm">
            <span className="text-ink font-bold">{(a.programs as unknown as { name: string } | null)?.name}</span>
            <span className="tag">{a.pay_mode.replace('_', ' ')} {formatCAD(a.rate_cents)}</span>
            <span className="tag">{a.frequency.replace('_', ' ')}</span>
            {!a.active && <span className="tag text-neg">replaced</span>}
            <form action={absenceAction} className="ml-auto flex items-end gap-1">
              <input type="hidden" name="staffId" value={staff.id} />
              <input type="hidden" name="assignmentId" value={a.id} />
              <input name="sessionDate" type="date" className="input text-xs" title="absent session" />
              <input name="replacementRate" placeholder="$sub" className="input w-16 text-xs" />
              <button type="submit" className="btn-ghost btn-sm">Mark absent</button>
            </form>
          </div>
        ))}
        <form action={assignAction} className="card grid gap-2 p-4 sm:grid-cols-6">
          <input type="hidden" name="staffId" value={staff.id} />
          <select name="programId" required className="input text-sm sm:col-span-2">{(programs ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <select name="payMode" className="input text-sm">{PAY_MODES.map((m) => <option key={m}>{m}</option>)}</select>
          <input name="rate" placeholder="$ rate" className="input text-sm" />
          <input name="units" type="number" placeholder="units" className="input text-sm" />
          <select name="frequency" className="input text-sm">{FREQS.map((f) => <option key={f}>{f}</option>)}</select>
          <input name="startDate" type="date" required className="input text-sm" />
          <input name="endDate" type="date" required className="input text-sm" />
          <button type="submit" className="btn-gold btn-sm sm:col-span-2">Assign + schedule pay</button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Certifications</h2>
        {(certs ?? []).map((c) => (
          <div key={c.id} className="flex items-center gap-3 text-sm"><span className="text-ink">{c.name}</span>{c.expires_on && <span className="tag">expires {c.expires_on}</span>}</div>
        ))}
        <form action={addCertAction} className="flex items-end gap-2">
          <input type="hidden" name="staffId" value={staff.id} />
          <div className="flex-1"><label className="field-label">Certification</label><input name="name" required placeholder="Vulnerable Sector Check" className="input text-sm" /></div>
          <div><label className="field-label">Expires</label><input name="expiresOn" type="date" className="input text-sm" /></div>
          <button type="submit" className="btn-ghost btn-sm">Add</button>
        </form>
      </section>

      <Link href="/staff" className="label text-[11px] hover:text-ink">← All staff</Link>
    </main>
  );
}
