import Link from 'next/link';
import { formatCAD } from '@ai/foundation';
import { getPortalSession } from '@/lib/auth';
import { staffForProfile, staffSelfView } from '@/lib/staff/staff';
import { removeMyUnavailabilityAction, submitMyUnavailabilityAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My staff view — Play' };

const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
const fmtSession = (iso: string) =>
  new Date(iso).toLocaleString('en-CA', { timeZone: 'America/Toronto', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-CA', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' });

/**
 * Staff self-view (Module 5 Stage 4): a coach/convenor's own READ-ONLY view of
 * their assigned programs' roster + schedule, capability-gated by the
 * permission matrix, plus date-unavailability submission. Mobile-first - this
 * is the page a coach opens courtside.
 */
export default async function StaffSelfViewPage() {
  const session = await getPortalSession();
  const staff = session.profileId ? await staffForProfile(session.profileId) : null;

  if (!staff) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 px-6 py-16">
        <h1 className="text-4xl">Staff view<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-body">
          {session.profileId
            ? 'No staff record is linked to this account. If you coach with us, ask the office to add your email to your staff record.'
            : 'Sign in with your staff email to see your programs, rosters, and schedule.'}
        </p>
        <Link href="/account" className="btn-ghost btn-sm self-start">← My account</Link>
      </main>
    );
  }

  const { caps, programs, pay, unavailability } = await staffSelfView(staff);
  const outstanding = pay.filter((p) => p.status === 'outstanding').reduce((a, p) => a + p.amountCents, 0);
  const nextPay = pay.find((p) => p.status === 'outstanding');

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2 border-b border-hairline pb-5">
        <p className="label text-[11px]">Play · Staff</p>
        <h1 className="text-4xl">{staff.first_name}&apos;s programs<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-sm text-silver">Read-only roster and schedule for your assignments. What you can see here is set by the office.</p>
      </header>

      {programs.length === 0 && <p className="text-body">No active program assignments right now.</p>}

      {programs.map((p) => (
        <section key={p.assignmentId} className="card flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl">{p.programName}</h2>
            {p.roleLabel && <span className="tag" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>{p.roleLabel}</span>}
          </div>

          {p.sessions.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="label text-[11px]">Next sessions</p>
              {p.sessions.map((s) => (
                <p key={s.startsAt} className="mono text-sm text-body">{fmtSession(s.startsAt)} – {fmtTime(s.endsAt)}</p>
              ))}
            </div>
          )}

          {p.rosterHidden ? (
            <p className="text-sm text-silver">Roster names are not enabled for your role.</p>
          ) : p.roster.length === 0 ? (
            <p className="text-sm text-silver">Nobody registered yet.</p>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="label text-[11px]">Roster · {p.roster.length}</p>
              {p.roster.map((m, i) => (
                <div key={i} className="border-b border-hairline py-1 text-sm">
                  <span className="text-ink">{m.name}</span>
                  {m.dob && <span className="ml-2 text-silver">DOB {m.dob}</span>}
                  {m.answers.length > 0 && (
                    <div className="mt-0.5 flex flex-col gap-0.5">
                      {m.answers.map((a, j) => <p key={j} className="text-xs text-silver">{a.label}: <span className="text-body">{a.answer}</span></p>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      ))}

      {pay.length > 0 && (
        <section className="card flex flex-col gap-2 p-5">
          <h2 className="text-2xl">My pay</h2>
          <p className="text-sm text-body">
            {outstanding > 0 ? <>Outstanding <span className="mono font-bold">{formatCAD(outstanding)}</span>{nextPay && <> · next {fmtDate(nextPay.dueDate)}</>}</> : 'All settled.'}
          </p>
          <div className="flex flex-col">
            {pay.slice(0, 10).map((row, i) => (
              <p key={i} className="flex justify-between border-b border-hairline py-1 text-sm">
                <span>{fmtDate(row.dueDate)} · {row.programName}</span>
                <span className="mono">{formatCAD(row.amountCents)} {row.status === 'paid' ? <span style={{ color: '#3f7a5b' }}>✓</span> : ''}</span>
              </p>
            ))}
          </div>
          <p className="text-xs text-silver">Tracking only — payments are made through payroll.</p>
        </section>
      )}

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-2xl">Unavailability</h2>
        <p className="text-sm text-silver">Can&apos;t make a date? Submit it — the office sees it when scheduling (it never auto-reassigns you).</p>
        {unavailability.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {unavailability.map((u) => (
              <form key={u.date} action={removeMyUnavailabilityAction} className="flex items-center">
                <input type="hidden" name="date" value={u.date} />
                <span className="tag">{fmtDate(u.date)}{u.note ? ` · ${u.note}` : ''}<button type="submit" className="ml-1 text-neg" title="Remove">×</button></span>
              </form>
            ))}
          </div>
        )}
        <form action={submitMyUnavailabilityAction} className="flex flex-wrap items-end gap-2">
          <div><label className="field-label">Date</label><input name="date" type="date" required className="input text-sm" /></div>
          <div className="min-w-40 flex-1"><label className="field-label">Note (optional)</label><input name="note" placeholder="e.g. out of town" className="input text-sm" /></div>
          <button type="submit" className="btn-gold btn-sm">Submit</button>
        </form>
      </section>

      {'score_entry' in caps && caps.score_entry.edit && (
        <p className="text-sm text-silver">You can enter game scores — open your division from the schedule on game day.</p>
      )}

      <Link href="/account" className="label text-[11px] hover:text-ink">← My account</Link>
    </main>
  );
}
