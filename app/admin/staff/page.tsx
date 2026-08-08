import Link from 'next/link';
import { biWeeklyPeriod, formatCAD, shiftPeriod, torontoDate, torontoToday, type PayPeriod } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { StaffListTable, type StaffListRow, type StaffPeriodSummary } from '@/components/admin/StaffListTable';
import { upcomingUnavailability } from '@/lib/staff/staff';
import { createStaffAction } from './actions';

export const dynamic = 'force-dynamic';

const STATUS_COLOR: Record<string, string> = { active: '#3f7a5b', inactive: '#9ea1a1', archived: '#1e1e1e' };
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });

/** Staff list + create (Module 5 Stage 1). Account-less coaches allowed. */
export default async function StaffListPage({ searchParams }: { searchParams: { q?: string; status?: string } }) {
  const q = (searchParams.q ?? '').trim();
  const statusFilter = ['active', 'inactive', 'archived'].includes(searchParams.status ?? '') ? searchParams.status! : '';

  const db = supabaseAdmin();
  const today = torontoToday();
  let query = db.from('staff').select('id, first_name, last_name, email, phone, status, profile_id, photo_url').order('last_name');
  if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`);
  if (statusFilter) query = query.eq('status', statusFilter);
  const soon = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  const [{ data: staff }, unavailability, { data: certAlerts }, { data: overduePay }] = await Promise.all([
    query,
    upcomingUnavailability(),
    db.from('staff_certifications').select('staff_id, name, expires_on, staff(first_name, last_name, status)').not('expires_on', 'is', null).lte('expires_on', soon).order('expires_on'),
    db.from('staff_pay_dates').select('due_date, amount_cents, staff_assignments(staff(id, first_name, last_name))').eq('status', 'outstanding').lt('due_date', today).order('due_date'),
  ]);

  // The Needs-attention queue: expired/expiring certs, submitted
  // unavailability, overdue pay, and coaches with no way to log in.
  type Attention = { severity: 'bad' | 'warn' | 'info'; staffId: number; title: string; detail: string };
  const attention: Attention[] = [];
  for (const c of certAlerts ?? []) {
    const s = c.staff as unknown as { first_name: string; last_name: string; status: string } | null;
    if (!s || s.status === 'archived') continue;
    const expired = c.expires_on! < today;
    attention.push({
      severity: expired ? 'bad' : 'warn',
      staffId: c.staff_id,
      title: `${s.first_name} ${s.last_name} — ${c.name} ${expired ? 'EXPIRED' : 'expiring'}`,
      detail: `${expired ? 'since' : 'on'} ${fmt(c.expires_on!)} · warn-only, never blocks assignment`,
    });
  }
  for (const u of unavailability) {
    attention.push({ severity: 'warn', staffId: u.staff_id, title: `${u.name} unavailable ${fmt(u.date)}`, detail: u.note ?? 'no note' });
  }
  for (const p of overduePay ?? []) {
    const s = (p.staff_assignments as unknown as { staff: { id: number; first_name: string; last_name: string } | null } | null)?.staff;
    if (!s) continue;
    attention.push({ severity: 'bad', staffId: s.id, title: `${s.first_name} ${s.last_name} — pay overdue`, detail: `${formatCAD(p.amount_cents)} was due ${fmt(p.due_date)}` });
  }
  for (const s of staff ?? []) {
    if (s.status !== 'archived' && !s.profile_id && !s.email) {
      attention.push({ severity: 'info', staffId: s.id, title: `${s.first_name} ${s.last_name} has no login yet`, detail: 'add an email to send an invite' });
    }
  }
  const SEVERITY_ORDER = { bad: 0, warn: 1, info: 2 } as const;
  attention.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const SEVERITY_COLOR = { bad: '#b4483c', warn: '#a08030', info: '#9ea1a1' } as const;

  // The quick-expand needs each coach's programs, and sessions + pay across
  // last/this/next bi-weekly periods.
  const thisPeriod = biWeeklyPeriod(torontoToday());
  const windows: Array<{ kind: StaffPeriodSummary['kind']; p: PayPeriod }> = [
    { kind: 'last', p: shiftPeriod(thisPeriod, -1) },
    { kind: 'this', p: thisPeriod },
    { kind: 'next', p: shiftPeriod(thisPeriod, 1) },
  ];
  const spanStart = windows[0].p.startISO;
  const spanEnd = windows[2].p.endISO;

  const staffIds = (staff ?? []).map((s) => s.id);
  const assignmentsByStaff = new Map<number, Array<{ program: string; role: string | null }>>();
  const staffByAssignment = new Map<number, number>();
  const programsByStaff = new Map<number, Set<number>>();
  const programIds = new Set<number>();
  if (staffIds.length) {
    const { data: assigns } = await db
      .from('staff_assignments')
      .select('id, staff_id, program_id, role_label, active, programs(name)')
      .in('staff_id', staffIds);
    for (const a of assigns ?? []) {
      staffByAssignment.set(a.id, a.staff_id);
      if (!a.active) continue; // closed assignments keep their pay dates but aren't current work
      const list = assignmentsByStaff.get(a.staff_id) ?? [];
      list.push({ program: (a.programs as unknown as { name: string } | null)?.name ?? '—', role: a.role_label });
      assignmentsByStaff.set(a.staff_id, list);
      const set = programsByStaff.get(a.staff_id) ?? new Set<number>();
      set.add(a.program_id);
      programsByStaff.set(a.staff_id, set);
      programIds.add(a.program_id);
    }
  }

  // Session dates per program across the three windows.
  const sessionDatesByProgram = new Map<number, string[]>();
  if (programIds.size) {
    const { data: sess } = await db
      .from('program_sessions')
      .select('program_id, starts_at')
      .in('program_id', [...programIds])
      .gte('starts_at', `${spanStart}T00:00:00-04:00`)
      .lte('starts_at', `${spanEnd}T23:59:59-04:00`);
    for (const s of sess ?? []) {
      const list = sessionDatesByProgram.get(s.program_id) ?? [];
      list.push(torontoDate(s.starts_at));
      sessionDatesByProgram.set(s.program_id, list);
    }
  }

  // Pay dates per staff across the three windows (via ALL their assignments).
  const payByStaff = new Map<number, Array<{ due: string; cents: number; paid: boolean }>>();
  const assignmentIds = [...staffByAssignment.keys()];
  if (assignmentIds.length) {
    const { data: pays } = await db
      .from('staff_pay_dates')
      .select('assignment_id, due_date, amount_cents, status')
      .in('assignment_id', assignmentIds)
      .gte('due_date', spanStart)
      .lte('due_date', spanEnd);
    for (const p of pays ?? []) {
      const sid = staffByAssignment.get(p.assignment_id)!;
      const list = payByStaff.get(sid) ?? [];
      list.push({ due: p.due_date, cents: p.amount_cents, paid: p.status === 'paid' });
      payByStaff.set(sid, list);
    }
  }

  const rows: StaffListRow[] = (staff ?? []).map((s) => {
    const progs = programsByStaff.get(s.id) ?? new Set<number>();
    const pays = payByStaff.get(s.id) ?? [];
    const periods: StaffPeriodSummary[] = windows.map(({ kind, p }) => {
      let sessions = 0;
      for (const pid of progs) sessions += (sessionDatesByProgram.get(pid) ?? []).filter((d) => d >= p.startISO && d <= p.endISO).length;
      const inWin = pays.filter((x) => x.due >= p.startISO && x.due <= p.endISO);
      const due = inWin.reduce((a, x) => a + x.cents, 0);
      const paid = inWin.filter((x) => x.paid).reduce((a, x) => a + x.cents, 0);
      return { kind, label: `${fmt(p.startISO)} – ${fmt(p.endISO)}`, sessions, payDue: due ? formatCAD(due) : null, payPaid: paid ? formatCAD(paid) : null };
    });
    return {
      id: s.id,
      name: `${s.first_name} ${s.last_name}`,
      sortName: `${s.last_name}, ${s.first_name}`.toLowerCase(),
      initials: `${s.first_name[0] ?? ''}${s.last_name[0] ?? ''}`,
      photoUrl: s.photo_url,
      status: s.status,
      statusColor: STATUS_COLOR[s.status] ?? '#9ea1a1',
      hasLogin: !!s.profile_id,
      email: s.email,
      phone: s.phone,
      assignments: assignmentsByStaff.get(s.id) ?? [],
      periods,
    };
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-hairline pb-6">
        <div>
          <p className="label text-[11px]">Admin · People &amp; staff</p>
          <h1 className="text-5xl">Staff<span style={{ color: 'var(--accent)' }}>.</span></h1>
          <p className="text-body mt-2">Records, roles, per-program pay, certifications. Status derives itself: assigned to a current program or owed pay = active.</p>
        </div>
        <div className="flex items-start gap-2">
          <details className="relative">
            <summary className="btn-ghost btn-sm inline-block cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              Needs attention{attention.length > 0 && <span className="mono ml-1" style={{ color: attention.some((a) => a.severity === 'bad') ? '#b4483c' : '#a08030' }}>· {attention.length}</span>}
            </summary>
            <div className="absolute right-0 z-10 mt-2 flex w-[min(30rem,90vw)] flex-col border border-hairline bg-paper shadow-lg">
              {attention.length === 0 && <p className="p-4 text-sm text-silver">All clear — no cert issues, overdue pay, or submitted unavailability.</p>}
              {attention.map((a, i) => (
                <Link key={i} href={`/staff/${a.staffId}`} className="flex gap-3 border-b border-hairline p-3 last:border-b-0 hover:bg-paper-panel">
                  <span className="w-[3px] shrink-0 self-stretch" style={{ background: SEVERITY_COLOR[a.severity] }} />
                  <span>
                    <span className="block text-sm font-bold text-ink">{a.title}</span>
                    <span className="block text-xs text-silver">{a.detail}</span>
                  </span>
                </Link>
              ))}
            </div>
          </details>
          <Link href="/staff/permissions" className="btn-ghost btn-sm">Permission matrix</Link>
          <Link href="/staff/pay" className="btn-ghost btn-sm">Pay dashboard</Link>
          <details className="relative">
            <summary className="btn-gold btn-sm inline-block cursor-pointer list-none [&::-webkit-details-marker]:hidden">Add staff</summary>
            <div className="absolute right-0 z-10 mt-2 w-[min(34rem,90vw)] border border-hairline bg-paper p-5 shadow-lg">
              <h2 className="text-xl">Add staff / coach</h2>
              <form action={createStaffAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                <div><label className="field-label" htmlFor="firstName">First</label><input id="firstName" name="firstName" required className="input text-sm" /></div>
                <div><label className="field-label" htmlFor="lastName">Last</label><input id="lastName" name="lastName" required className="input text-sm" /></div>
                <div><label className="field-label" htmlFor="email">Email (optional — add later to invite)</label><input id="email" name="email" type="email" className="input text-sm" /></div>
                <div><label className="field-label" htmlFor="phone">Cell phone</label><input id="phone" name="phone" type="tel" placeholder="(519) 555-0123" className="input text-sm" /></div>
                <div className="sm:col-span-2"><label className="field-label" htmlFor="bio">Bio (global)</label><textarea id="bio" name="bio" rows={2} className="input text-sm" /></div>
                <p className="text-xs text-silver sm:col-span-2">A coach can be added with no account or email now (e.g. from a roster upload) and upgraded to a login later.</p>
                <button type="submit" className="btn-gold btn-sm justify-self-start">Add</button>
              </form>
            </div>
          </details>
        </div>
      </header>

      <form method="get" action="/staff" className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label className="field-label" htmlFor="q">Search</label>
          <input id="q" name="q" defaultValue={q} placeholder="Name or email…" className="input h-9 text-sm" />
        </div>
        <div>
          <label className="field-label" htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={statusFilter} className="input h-9 text-sm">
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <button type="submit" className="btn-ghost btn-sm">Filter</button>
      </form>

      <StaffListTable rows={rows} />
    </main>
  );
}
