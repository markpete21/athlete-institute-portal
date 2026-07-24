import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BRANDS, PROGRAM_CATEGORIES, buildTree, flattenTree, formatCAD, type FacilityNode } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { getProgram } from '@/lib/programs/programs';
import { listQuestions, programQuestions } from '@/lib/programs/questions';
import { listWaivers } from '@/lib/waivers';
import {
  assignStaffAction,
  attachProgramWaiverAction,
  attachQuestionAction,
  detachQuestionAction,
  generateSessionsAction,
  draftDescriptionAction,
  setStatusAction,
  unassignStaffAction,
  updateProgramAction,
} from '../actions';

export const dynamic = 'force-dynamic';

const STATUSES = ['draft', 'published', 'registration_open', 'full', 'closed', 'archived'];
const dollars = (c: number | null) => (c == null ? '' : (c / 100).toFixed(2));
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default async function ProgramBuilderPage({ params }: { params: { id: string } }) {
  const program = await getProgram(Number(params.id));
  if (!program) notFound();

  const db = supabaseAdmin();
  const [{ data: facRows }, { data: staff }, { data: sessions }, { data: profs }] = await Promise.all([
    db.from('facilities').select('id, parent_id, name, label, sort_order, bookable, deleted_at').is('deleted_at', null),
    db.from('program_staff').select('id, profile_id, role_label, profiles(email, first_name, last_name)').eq('program_id', program.id),
    db.from('program_sessions').select('id, starts_at, ends_at').eq('program_id', program.id).order('starts_at'),
    db.from('registrations').select('id', { count: 'exact', head: true }).eq('program_id', program.id).eq('status', 'active'),
  ]);
  const ordered = flattenTree(buildTree((facRows ?? []) as FacilityNode[]));
  const playBase = process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca';
  const [attachedQuestions, allQuestions, waivers] = await Promise.all([programQuestions(program.id), listQuestions(), listWaivers()]);
  const attachedIds = new Set(attachedQuestions.map((q) => q.id));

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-14">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-hairline pb-5">
        <div>
          <p className="label text-[11px]">Admin · Programs · #{program.id}</p>
          <h1 className="text-4xl">{program.name}<span style={{ color: 'var(--accent)' }}>.</span></h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="tag">{program.category}</span>
            <span className="tag">{program.brand_key}</span>
            <span className="tag">{program.proration_method} proration</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <form action={setStatusAction} className="flex items-end gap-2">
            <input type="hidden" name="programId" value={program.id} />
            <select name="status" defaultValue={program.status} className="input text-sm">
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
            <button type="submit" className="btn-ghost btn-sm">Set status</button>
          </form>
          <span className="tag" title="Copy share link">{playBase}/p/{program.share_token}</span>
        </div>
      </header>

      {/* Module 22: staff-reviewed AI description draft (fills the field below). */}
      <form action={draftDescriptionAction} className="flex justify-end">
        <input type="hidden" name="programId" value={program.id} />
        <button className="btn-ghost btn-sm" title="Generates an on-brand description from this program's fields - edit before saving.">Draft description with AI</button>
      </form>

      {/* Core + pricing */}
      <form action={updateProgramAction} className="card grid gap-4 p-6 sm:grid-cols-2">
        <input type="hidden" name="programId" value={program.id} />
        <div className="sm:col-span-2">
          <label className="field-label">Name</label>
          <input name="name" defaultValue={program.name} className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="field-label">Description</label>
          <textarea name="description" defaultValue={program.description ?? ''} rows={2} className="input" />
        </div>
        <div>
          <label className="field-label">Category</label>
          <select name="category" defaultValue={program.category} className="input">
            {PROGRAM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Brand</label>
          <select name="brandKey" defaultValue={program.brand_key} className="input">
            {BRANDS.map((b) => <option key={b.key} value={b.key}>{b.name}</option>)}
          </select>
        </div>
        <div><label className="field-label">Sport</label><input name="sportTag" defaultValue={program.sport_tag ?? ''} className="input" /></div>
        <div><label className="field-label">Season key</label><input name="seasonKey" defaultValue={program.season_key ?? ''} placeholder="2026:sep-dec" className="input" /></div>
        <div className="flex gap-2">
          <div><label className="field-label">Min age</label><input name="minAge" type="number" defaultValue={program.min_age ?? ''} className="input w-20" /></div>
          <div><label className="field-label">Max age</label><input name="maxAge" type="number" defaultValue={program.max_age ?? ''} className="input w-20" /></div>
          <div><label className="field-label">Capacity</label><input name="capacity" type="number" defaultValue={program.capacity ?? ''} className="input w-20" /></div>
        </div>
        <div><label className="field-label">Proration method</label>
          <select name="prorationMethod" defaultValue={program.proration_method} className="input">
            {['none','league','clinic','camp','dropin'].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="sm:col-span-2 border-t border-hairline pt-3"><p className="label text-[11px]">Pricing (Stage 4 flow uses these)</p></div>
        <div><label className="field-label">Base price $</label><input name="basePrice" defaultValue={dollars(program.base_price_cents)} className="input" /></div>
        <div className="flex gap-2">
          <div><label className="field-label">Early-bird $</label><input name="earlyBirdPrice" defaultValue={dollars(program.early_bird_price_cents)} className="input w-24" /></div>
          <div><label className="field-label">until</label><input name="earlyBirdUntil" type="date" defaultValue={program.early_bird_until ?? ''} className="input" /></div>
        </div>
        <div className="flex gap-2">
          <div><label className="field-label">Late fee $</label><input name="lateFee" defaultValue={dollars(program.late_fee_cents)} className="input w-24" /></div>
          <div><label className="field-label">after</label><input name="lateFeeAfter" type="date" defaultValue={program.late_fee_after ?? ''} className="input" /></div>
        </div>
        <div className="flex gap-2">
          <div><label className="field-label">Returning disc. $</label><input name="returningDiscount" defaultValue={dollars(program.returning_discount_cents)} className="input w-24" /></div>
          <div><label className="field-label">Multi-member $</label><input name="multiMemberDiscount" defaultValue={dollars(program.multi_member_discount_cents)} className="input w-24" /></div>
        </div>
        <div className="flex items-end gap-4">
          <label className="flex items-center gap-1 pb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-silver">
            <input type="checkbox" name="scholarshipEligible" defaultChecked={program.scholarship_eligible} /> scholarship
          </label>
          <div className="flex-1"><label className="field-label">QuickBooks class (margin)</label><input name="quickbooksClass" defaultValue={program.quickbooks_class ?? ''} className="input" /></div>
        </div>
        <div className="sm:col-span-2 flex justify-end"><button type="submit" className="btn-gold">Save program</button></div>
      </form>

      {/* Sessions via Module 2 */}
      <section className="card flex flex-col gap-3 p-6">
        <h2 className="text-2xl">Sessions</h2>
        {(sessions ?? []).length > 0 && (
          <p className="text-sm text-body">{(sessions ?? []).length} sessions booked · first {new Date(sessions![0].starts_at).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })}</p>
        )}
        <form action={generateSessionsAction} className="grid gap-3 sm:grid-cols-6">
          <input type="hidden" name="programId" value={program.id} />
          <div className="sm:col-span-2">
            <label className="field-label">Facility</label>
            <select name="facilityId" required className="input text-sm">
              {ordered.filter((f) => f.bookable).map((f) => <option key={f.id} value={f.id}>{' '.repeat(f.depth * 2)}{f.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Weekday</label>
            <select name="weekdaySingle" className="input text-sm" defaultValue="6">
              {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
          <div><label className="field-label">Start date</label><input name="startDate" type="date" required className="input text-sm" /></div>
          <div><label className="field-label">Time</label><div className="flex gap-1"><input name="startTime" type="time" required className="input text-sm" /><input name="endTime" type="time" required className="input text-sm" /></div></div>
          <div className="flex items-end gap-1">
            <div><label className="field-label">Count</label><input name="count" type="number" placeholder="6" className="input w-16 text-sm" /></div>
            <button type="submit" className="btn-gold btn-sm">Generate</button>
          </div>
        </form>
      </section>

      {/* Staff assignment */}
      <section className="card flex flex-col gap-3 p-6">
        <h2 className="text-2xl">Assigned staff</h2>
        {(staff ?? []).map((s) => {
          const p = s.profiles as unknown as { email: string | null; first_name: string | null; last_name: string | null } | null;
          return (
            <form key={s.id} action={unassignStaffAction} className="flex items-center gap-3 text-sm">
              <input type="hidden" name="programId" value={program.id} />
              <input type="hidden" name="profileId" value={s.profile_id} />
              <span className="text-ink">{[p?.first_name, p?.last_name].filter(Boolean).join(' ') || p?.email}</span>
              <span className="tag">{s.role_label ?? 'staff'}</span>
              <button type="submit" className="btn-ghost btn-sm text-neg">Remove</button>
            </form>
          );
        })}
        <form action={assignStaffAction} className="flex items-end gap-2">
          <input type="hidden" name="programId" value={program.id} />
          <div className="flex-1"><label className="field-label">Assign by email</label><input name="email" type="email" className="input text-sm" /></div>
          <div><label className="field-label">Role</label><input name="roleLabel" placeholder="Coach" className="input text-sm w-32" /></div>
          <button type="submit" className="btn-ghost btn-sm">Assign</button>
        </form>
      </section>

      {/* Custom questions (Stage 2) */}
      <section className="card flex flex-col gap-3 p-6">
        <h2 className="text-2xl">Registration questions</h2>
        {attachedQuestions.map((q) => (
          <form key={q.id} action={detachQuestionAction} className="flex items-center gap-3 text-sm">
            <input type="hidden" name="programId" value={program.id} />
            <input type="hidden" name="questionId" value={q.id} />
            <span className="text-ink">{q.label}</span>
            <span className="tag">{q.qtype}</span>
            {q.required_effective && <span className="tag" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>required</span>}
            <button type="submit" className="btn-ghost btn-sm text-neg ml-auto">Remove</button>
          </form>
        ))}
        {attachedQuestions.length === 0 && <p className="text-sm text-silver">No questions yet.</p>}
        <form action={attachQuestionAction} className="flex items-end gap-2 border-t border-hairline pt-3">
          <input type="hidden" name="programId" value={program.id} />
          <div className="flex-1">
            <label className="field-label">Add from library</label>
            <select name="questionId" className="input text-sm">
              {allQuestions.filter((q) => !attachedIds.has(q.id)).map((q) => <option key={q.id} value={q.id}>{q.label} ({q.qtype})</option>)}
            </select>
          </div>
          <button type="submit" className="btn-ghost btn-sm">Attach</button>
          <a href="/programs/questions" className="btn-ghost btn-sm">Manage library ↗</a>
        </form>
      </section>

      {/* Waiver (Stage 6) + gear link (Stage 5) */}
      <section className="card flex flex-wrap items-end gap-4 p-6">
        <form action={attachProgramWaiverAction} className="flex items-end gap-2">
          <input type="hidden" name="programId" value={program.id} />
          <div>
            <label className="field-label">Waiver (one per family, 1-yr validity)</label>
            <select name="waiverId" defaultValue={program.waiver_id ?? ''} className="input text-sm">
              <option value="">No waiver</option>
              {waivers.map((w) => <option key={w.id} value={w.id}>{w.name} (v{w.version})</option>)}
            </select>
          </div>
          <button type="submit" className="btn-ghost btn-sm">Attach</button>
        </form>
        <a href={`/programs/${program.id}/gear`} className="btn-ghost btn-sm">Gear order sheet ↗</a>
      </section>

      <p className="text-sm text-silver">
        Refund/proration (Stage 7) and the public catalog (Stage 8) attach as those stages land.
      </p>
    </main>
  );
}
