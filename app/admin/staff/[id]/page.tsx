import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatCAD, torontoToday } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { staffReviewLog } from '@/lib/staff/staff';
import {
  absenceAction,
  addCertAction,
  addEmailAction,
  archiveStaffAction,
  assignAction,
  deleteCertAction,
  grantRoleAction,
  photoAction,
  removeAssignmentAction,
  removePhotoAction,
  replaceRemainderAction,
  revokeRoleAction,
  updateDetailsAction,
  updateRateAction,
} from '../actions';

export const dynamic = 'force-dynamic';

const PAY_MODES = [
  { value: 'per_session', label: 'per session' },
  { value: 'hourly', label: 'hourly' },
  { value: 'flat', label: 'flat per program' },
  { value: 'salary', label: 'salary / period' },
];
const FREQS = [
  { value: 'after_program', label: 'after program' },
  { value: 'bi_weekly', label: 'bi-weekly' },
  { value: 'monthly', label: 'monthly' },
];
const ROLE_LABELS = ['Head Coach', 'Assistant Coach', 'Convenor', 'Trainer', 'Facility Coordinator', 'Volunteer'];

const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });

export default async function StaffDetailPage({ params }: { params: { id: string } }) {
  const db = supabaseAdmin();
  const { data: staff } = await db.from('staff').select('id, first_name, last_name, email, phone, bio, photo_url, status, profile_id, employment').eq('id', Number(params.id)).maybeSingle();
  if (!staff) notFound();
  const reviews = await staffReviewLog(staff.id);

  const [{ data: assigns }, { data: certs }, { data: programs }, { data: allStaff }, { data: unav }, { data: roles }] = await Promise.all([
    db.from('staff_assignments').select('id, program_id, role_label, pay_mode, rate_cents, frequency, active, effective_until, show_public, programs(name)').eq('staff_id', staff.id).order('id'),
    db.from('staff_certifications').select('id, name, obtained_on, expires_on').eq('staff_id', staff.id).order('name'),
    db.from('programs').select('id, name').in('status', ['draft', 'published', 'registration_open', 'full']).order('name'),
    db.from('staff').select('id, first_name, last_name').neq('status', 'archived').neq('id', staff.id).order('last_name'),
    db.from('staff_unavailability').select('date, note').eq('staff_id', staff.id).gte('date', torontoToday()).order('date'),
    db.from('roles').select('id, name').order('name'),
  ]);

  const assignIds = (assigns ?? []).map((a) => a.id);
  const [{ data: payRows }, { data: absenceRows }, roleAssignments] = await Promise.all([
    assignIds.length ? db.from('staff_pay_dates').select('assignment_id, amount_cents, status').in('assignment_id', assignIds) : Promise.resolve({ data: [] as Array<{ assignment_id: number; amount_cents: number; status: string }> }),
    assignIds.length ? db.from('staff_session_absences').select('assignment_id, session_date, replacement_staff_id, replacement_rate_cents, staff:replacement_staff_id(first_name, last_name)').in('assignment_id', assignIds).order('session_date') : Promise.resolve({ data: [] as never[] }),
    staff.profile_id
      ? db.from('role_assignments').select('id, role_id, roles(name)').eq('profile_id', staff.profile_id).then((r) => r.data ?? [])
      : Promise.resolve([] as Array<{ id: number; role_id: number; roles: unknown }>),
  ]);

  const payByAssign = new Map<number, { owed: number; paid: number }>();
  for (const p of payRows ?? []) {
    const cur = payByAssign.get(p.assignment_id) ?? { owed: 0, paid: 0 };
    if (p.status === 'paid') cur.paid += p.amount_cents;
    else cur.owed += p.amount_cents;
    payByAssign.set(p.assignment_id, cur);
  }
  const absencesByAssign = new Map<number, Array<{ session_date: string; sub: string | null; rate: number | null }>>();
  for (const ab of (absenceRows ?? []) as unknown as Array<{ assignment_id: number; session_date: string; replacement_rate_cents: number | null; staff: { first_name: string; last_name: string } | null }>) {
    const list = absencesByAssign.get(ab.assignment_id) ?? [];
    list.push({ session_date: ab.session_date, sub: ab.staff ? `${ab.staff.first_name} ${ab.staff.last_name}` : null, rate: ab.replacement_rate_cents });
    absencesByAssign.set(ab.assignment_id, list);
  }
  const heldRoleIds = new Set((roleAssignments as Array<{ role_id: number }>).map((r) => r.role_id));
  const today = torontoToday();
  const soon = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  const initials = `${staff.first_name[0] ?? ''}${staff.last_name[0] ?? ''}`;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-hairline pb-6">
        <div className="flex items-start gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-hairline bg-paper-panel">
            {staff.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={staff.photo_url} alt={`${staff.first_name} ${staff.last_name}`} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-xl font-bold text-silver">{initials}</span>
            )}
          </div>
          <div>
            <p className="label text-[11px]">Admin · Staff · #{staff.id}</p>
            <h1 className="text-4xl">{staff.first_name} {staff.last_name}<span style={{ color: 'var(--accent)' }}>.</span></h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="tag">{staff.status}</span>
              {!staff.profile_id && <span className="tag">account-less</span>}
              {staff.employment && <span className="tag">{staff.employment}</span>}
              {staff.email && <span className="tag">{staff.email}</span>}
              {staff.phone && <span className="tag mono">{staff.phone}</span>}
              {reviews.avg !== null && (
                <span className="tag" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }} title={`${reviews.avg} / 5 from ${reviews.count} review${reviews.count === 1 ? '' : 's'}`}>
                  ★ {reviews.avg} ({reviews.count})
                </span>
              )}
              {(roleAssignments as Array<{ id: number; roles: unknown }>).map((ra) => (
                <span key={ra.id} className="tag" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>{(ra.roles as { name: string } | null)?.name}</span>
              ))}
            </div>
          </div>
        </div>
        <form action={archiveStaffAction}>
          <input type="hidden" name="staffId" value={staff.id} />
          {staff.status === 'archived' ? <><input type="hidden" name="unarchive" value="on" /><button className="btn-ghost btn-sm">Unarchive</button></> : <button className="btn-ghost btn-sm text-neg">Archive</button>}
        </form>
      </header>

      {/* Identity: details edit + photo + login upgrade + roles */}
      <section className="grid gap-4 sm:grid-cols-2">
        <form action={updateDetailsAction} className="card flex flex-col gap-3 p-5">
          <h2 className="text-xl">Details</h2>
          <input type="hidden" name="staffId" value={staff.id} />
          <div className="grid grid-cols-2 gap-2">
            <div><label className="field-label" htmlFor="firstName">First</label><input id="firstName" name="firstName" defaultValue={staff.first_name} required className="input text-sm" /></div>
            <div><label className="field-label" htmlFor="lastName">Last</label><input id="lastName" name="lastName" defaultValue={staff.last_name} required className="input text-sm" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="field-label" htmlFor="phone">Cell phone</label><input id="phone" name="phone" type="tel" defaultValue={staff.phone ?? ''} placeholder="(519) 555-0123" className="input text-sm" /></div>
            <div>
              <label className="field-label" htmlFor="employment">Classification</label>
              <select id="employment" name="employment" defaultValue={staff.employment ?? ''} className="input text-sm">
                <option value="">— not set —</option>
                <option value="employee">Employee (Wagepoint payroll)</option>
                <option value="contractor">Contractor</option>
                <option value="volunteer">Volunteer (no pay)</option>
              </select>
            </div>
          </div>
          <div><label className="field-label" htmlFor="bio">Bio (global — shown with their photo on public pages)</label><textarea id="bio" name="bio" rows={3} defaultValue={staff.bio ?? ''} className="input text-sm" /></div>
          <button type="submit" className="btn-ghost btn-sm self-start">Save details</button>
        </form>

        <div className="flex flex-col gap-4">
          <form action={photoAction} className="card flex flex-col gap-2 p-5">
            <h2 className="text-xl">Photo</h2>
            <p className="text-sm text-silver">Shown on public program pages. JPEG/PNG/WebP, under 5MB.</p>
            <input type="hidden" name="staffId" value={staff.id} />
            <div className="flex items-end gap-2">
              <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required className="input flex-1 text-sm" />
              <button type="submit" className="btn-ghost btn-sm">Upload</button>
            </div>
          </form>
          {staff.photo_url && (
            <form action={removePhotoAction} className="-mt-2 px-5">
              <input type="hidden" name="staffId" value={staff.id} />
              <button type="submit" className="label text-[11px] text-neg hover:underline">Remove photo</button>
            </form>
          )}

          {!staff.email ? (
            <form action={addEmailAction} className="card flex items-end gap-2 p-5">
              <input type="hidden" name="staffId" value={staff.id} />
              <div className="flex-1"><label className="field-label">Add email (upgrade to a login)</label><input name="email" type="email" required className="input text-sm" /></div>
              <button type="submit" className="btn-gold btn-sm">Add + invite</button>
            </form>
          ) : staff.profile_id ? (
            <div className="card flex flex-col gap-2 p-5">
              <h2 className="text-xl">Portal roles</h2>
              <p className="text-sm text-silver">Module 1 roles — capabilities come from the <Link href="/staff/permissions" className="underline">permission matrix</Link>.</p>
              <div className="flex flex-wrap items-center gap-2">
                {(roleAssignments as Array<{ id: number; roles: unknown }>).map((ra) => (
                  <form key={ra.id} action={revokeRoleAction} className="flex items-center">
                    <input type="hidden" name="staffId" value={staff.id} />
                    <input type="hidden" name="assignmentId" value={ra.id} />
                    <span className="tag">{(ra.roles as { name: string } | null)?.name}<button type="submit" className="ml-1 text-neg" title="Revoke">×</button></span>
                  </form>
                ))}
                {(roleAssignments as unknown[]).length === 0 && <span className="text-sm text-silver">No roles yet.</span>}
              </div>
              <form action={grantRoleAction} className="flex items-end gap-2">
                <input type="hidden" name="staffId" value={staff.id} />
                <input type="hidden" name="profileId" value={staff.profile_id} />
                <div className="flex-1">
                  <label className="field-label">Grant role</label>
                  <select name="roleId" className="input text-sm">
                    {(roles ?? []).filter((r) => !heldRoleIds.has(r.id)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <button type="submit" className="btn-ghost btn-sm">Grant</button>
              </form>
            </div>
          ) : (
            <div className="card p-5 text-sm text-silver">
              Email on file — they get linked automatically the first time they sign in with it. Roles can be granted once linked.
            </div>
          )}
        </div>
      </section>

      {/* Assignments */}
      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Program assignments</h2>
        {(assigns ?? []).length === 0 && <p className="text-sm text-silver">Not assigned to any programs.</p>}
        {(assigns ?? []).map((a) => {
          const pay = payByAssign.get(a.id) ?? { owed: 0, paid: 0 };
          const absences = absencesByAssign.get(a.id) ?? [];
          return (
            <div key={a.id} className="card flex flex-col gap-3 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-bold text-ink">{(a.programs as unknown as { name: string } | null)?.name}</span>
                {a.role_label && <span className="tag" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>{a.role_label}</span>}
                <span className="tag">{a.pay_mode.replace('_', ' ')} {formatCAD(a.rate_cents)}</span>
                <span className="tag">{a.frequency.replace('_', ' ')}</span>
                {!a.show_public && <span className="tag">hidden from public</span>}
                {!a.active && <span className="tag text-neg">replaced{a.effective_until ? ` ${fmt(a.effective_until)}` : ''}</span>}
                <span className="ml-auto mono text-xs text-silver">owed {formatCAD(pay.owed)} · paid {formatCAD(pay.paid)}</span>
              </div>

              {absences.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {absences.map((ab) => (
                    <span key={ab.session_date} className="tag">
                      absent {fmt(ab.session_date)}{ab.sub ? ` → ${ab.sub}` : ''}{ab.rate ? ` @ ${formatCAD(ab.rate)}` : ''}
                    </span>
                  ))}
                </div>
              )}

              {a.active && (
                <div className="flex flex-wrap gap-4">
                  <details className="min-w-56 flex-1">
                    <summary className="label cursor-pointer text-[11px]">Change rate</summary>
                    <form action={updateRateAction} className="mt-2 grid gap-2 sm:grid-cols-2">
                      <input type="hidden" name="staffId" value={staff.id} />
                      <input type="hidden" name="assignmentId" value={a.id} />
                      <div><label className="field-label">New rate $ ({a.pay_mode.replace('_', ' ')})</label><input name="newRate" required placeholder="0.00" className="input text-xs" /></div>
                      <div><label className="field-label">From date</label><input name="fromDate" type="date" defaultValue={today} className="input text-xs" /></div>
                      <p className="text-xs text-silver sm:col-span-2">Work before the date stays at the old rate; the outstanding schedule re-cuts at the new one. Paid dates never move.</p>
                      <button type="submit" className="btn-ghost btn-sm sm:col-span-2">Update rate</button>
                    </form>
                  </details>
                  <details className="min-w-64 flex-1">
                    <summary className="label cursor-pointer text-[11px]">Mark a session absent</summary>
                    <form action={absenceAction} className="mt-2 grid gap-2 sm:grid-cols-2">
                      <input type="hidden" name="staffId" value={staff.id} />
                      <input type="hidden" name="assignmentId" value={a.id} />
                      <div><label className="field-label">Session date</label><input name="sessionDate" type="date" required className="input text-xs" /></div>
                      <div>
                        <label className="field-label">Replacement (optional)</label>
                        <select name="replacementStaffId" className="input text-xs">
                          <option value="">— none / ad-hoc below —</option>
                          {(allStaff ?? []).map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
                        </select>
                      </div>
                      <div><label className="field-label">…or ad-hoc name</label><input name="replacementName" placeholder="New coach name" className="input text-xs" /></div>
                      <div><label className="field-label">Replacement rate $</label><input name="replacementRate" placeholder="0.00" className="input text-xs" /></div>
                      <p className="text-xs text-silver sm:col-span-2">Their session pay moves off this coach&apos;s schedule; the replacement is paid the entered rate.</p>
                      <button type="submit" className="btn-ghost btn-sm sm:col-span-2">Record absence</button>
                    </form>
                  </details>
                  <details className="min-w-64 flex-1">
                    <summary className="label cursor-pointer text-[11px]">Replace for the remainder</summary>
                    <form action={replaceRemainderAction} className="mt-2 grid gap-2 sm:grid-cols-2">
                      <input type="hidden" name="staffId" value={staff.id} />
                      <input type="hidden" name="assignmentId" value={a.id} />
                      <div><label className="field-label">From date</label><input name="fromDate" type="date" required className="input text-xs" /></div>
                      <div>
                        <label className="field-label">Replacement</label>
                        <select name="replacementStaffId" className="input text-xs">
                          <option value="">— pick or ad-hoc below —</option>
                          {(allStaff ?? []).map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
                        </select>
                      </div>
                      <div><label className="field-label">…or ad-hoc name</label><input name="replacementName" placeholder="New coach name" className="input text-xs" /></div>
                      <div><label className="field-label">New rate $ ({a.pay_mode.replace('_', ' ')})</label><input name="newRate" required placeholder="0.00" className="input text-xs" /></div>
                      <p className="text-xs text-silver sm:col-span-2">Closes this assignment at the date; re-cuts their remaining pay to the portion worked and schedules the replacement at the new rate.</p>
                      <button type="submit" className="btn-ghost btn-sm sm:col-span-2">Replace</button>
                    </form>
                  </details>
                </div>
              )}

              {pay.paid === 0 && (
                <form action={removeAssignmentAction} className="self-end">
                  <input type="hidden" name="staffId" value={staff.id} />
                  <input type="hidden" name="assignmentId" value={a.id} />
                  <button type="submit" className="label text-[11px] text-neg hover:underline">Remove assignment (nothing paid yet)</button>
                </form>
              )}
            </div>
          );
        })}

        <form action={assignAction} className="card grid gap-3 p-4 sm:grid-cols-3">
          <p className="label text-[11px] sm:col-span-3">Assign to a program</p>
          <input type="hidden" name="staffId" value={staff.id} />
          <div><label className="field-label">Program</label><select name="programId" required className="input text-sm">{(programs ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div>
            <label className="field-label">Role on this program</label>
            <input name="roleLabel" list="role-labels" placeholder="Head Coach" className="input text-sm" />
            <datalist id="role-labels">{ROLE_LABELS.map((r) => <option key={r} value={r} />)}</datalist>
          </div>
          <div><label className="field-label">Pay mode</label><select name="payMode" className="input text-sm">{PAY_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
          <div><label className="field-label">Rate $</label><input name="rate" placeholder="0.00" className="input text-sm" /></div>
          <div><label className="field-label">Units (auto = sessions)</label><input name="units" type="number" placeholder="auto" className="input text-sm" /></div>
          <div><label className="field-label">Frequency</label><select name="frequency" className="input text-sm">{FREQS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select></div>
          <div><label className="field-label">Start (auto from sessions)</label><input name="startDate" type="date" className="input text-sm" /></div>
          <div><label className="field-label">End (auto from sessions)</label><input name="endDate" type="date" className="input text-sm" /></div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 pb-2 text-sm text-body"><input type="checkbox" name="showPublic" defaultChecked /> show publicly</label>
            <button type="submit" className="btn-gold btn-sm">Assign + schedule pay</button>
          </div>
        </form>
      </section>

      {/* Certifications */}
      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Certifications</h2>
        {(certs ?? []).length === 0 && <p className="text-sm text-silver">None recorded. Vulnerable Sector Check and Safe Sport Training are the usual two.</p>}
        {(certs ?? []).map((c) => {
          const state = c.expires_on ? (c.expires_on < today ? 'expired' : c.expires_on <= soon ? 'expiring' : 'ok') : 'ok';
          const color = state === 'expired' ? '#b4483c' : state === 'expiring' ? '#a08030' : undefined;
          return (
            <div key={c.id} className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-ink">{c.name}</span>
              {c.obtained_on && <span className="tag">obtained {fmt(c.obtained_on)}</span>}
              {c.expires_on && <span className="tag" style={color ? { color, borderColor: color } : undefined}>{state === 'expired' ? 'EXPIRED' : 'expires'} {fmt(c.expires_on)}</span>}
              <form action={deleteCertAction}>
                <input type="hidden" name="staffId" value={staff.id} />
                <input type="hidden" name="certId" value={c.id} />
                <button type="submit" className="label text-[11px] text-neg hover:underline">remove</button>
              </form>
            </div>
          );
        })}
        <form action={addCertAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="staffId" value={staff.id} />
          <div className="min-w-52 flex-1"><label className="field-label">Certification</label><input name="name" required list="cert-names" placeholder="Vulnerable Sector Check" className="input text-sm" /></div>
          <datalist id="cert-names"><option value="Vulnerable Sector Check" /><option value="Safe Sport Training" /><option value="First Aid / CPR" /></datalist>
          <div><label className="field-label">Obtained</label><input name="obtainedOn" type="date" className="input text-sm" /></div>
          <div><label className="field-label">Expires</label><input name="expiresOn" type="date" className="input text-sm" /></div>
          <button type="submit" className="btn-ghost btn-sm">Add</button>
        </form>
        <p className="text-xs text-silver">Expiry warns ops by email — it never blocks assignment.</p>
      </section>

      {/* Reviews: compiled stars + the typed-feedback log (Module 15) */}
      {reviews.count > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-2xl">Reviews</h2>
            <span style={{ color: 'var(--accent)', letterSpacing: '1px' }} aria-hidden>
              {'★'.repeat(Math.round(reviews.avg ?? 0))}<span style={{ opacity: 0.25 }}>{'★'.repeat(5 - Math.round(reviews.avg ?? 0))}</span>
            </span>
            <span className="mono text-sm text-silver">{reviews.avg} / 5 · {reviews.count} review{reviews.count === 1 ? '' : 's'}</span>
            <Link href="/staff/reviews" className="label text-[11px] hover:text-ink">All reviews ↗</Link>
          </div>
          {reviews.entries.length === 0 ? (
            <p className="text-sm text-silver">No typed feedback yet — star ratings only.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {reviews.entries.map((e, i) => (
                <div key={i} className="card flex flex-col gap-1 p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span style={{ color: 'var(--accent)', letterSpacing: '1px' }} aria-hidden>{'★'.repeat(e.rating)}<span style={{ opacity: 0.25 }}>{'★'.repeat(5 - e.rating)}</span></span>
                    <span className="tag">{e.programName}</span>
                    {e.submittedAt && <span className="mono text-xs text-silver">{fmt(e.submittedAt.slice(0, 10))}</span>}
                  </div>
                  <p className="text-body">{e.comment}</p>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-silver">Collected in the Feedback module. A program&apos;s responses count for each coach who publicly delivered it; per-coach questions land with the Feedback review.</p>
        </section>
      )}

      {/* Submitted unavailability */}
      {(unav ?? []).length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-2xl">Submitted unavailability</h2>
          <div className="flex flex-wrap gap-2">
            {(unav ?? []).map((u) => <span key={u.date} className="tag">{fmt(u.date)}{u.note ? ` · ${u.note}` : ''}</span>)}
          </div>
          <p className="text-xs text-silver">Self-submitted from their staff view — informs scheduling, never auto-reassigns.</p>
        </section>
      )}

      <Link href="/staff" className="label text-[11px] hover:text-ink">← All staff</Link>
    </main>
  );
}
