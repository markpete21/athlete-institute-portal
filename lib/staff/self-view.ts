import 'server-only';
import {
  can,
  torontoToday,
  type ResolvedCapability,
} from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { capabilitiesForProfile } from '@/lib/access/capabilities';
import { payRows } from '@/lib/staff/pay-report';
import { S_COLS, type Staff } from '@/lib/staff/records';

/**
 * The staff member's own read-only view on play.* — programs, rosters (capability
 * gated), pay and unavailability. Never admin access; ownership is the guard.
 */

// --- Staff self-view (play side) ---------------------------------------------

export async function staffForProfile(profileId: number): Promise<Staff | null> {
  const { data } = await supabaseAdmin().from('staff').select(S_COLS).eq('profile_id', profileId).maybeSingle();
  return (data as Staff | null) ?? null;
}

export interface SelfViewProgram {
  programId: number;
  programName: string;
  roleLabel: string | null;
  assignmentId: number;
  /** Next sessions, Toronto-labelled by the page. */
  sessions: Array<{ startsAt: string; endsAt: string }>;
  /** Roster names; empty when roster_names is not granted. */
  roster: Array<{ name: string; dob: string | null; answers: Array<{ label: string; answer: string }> }>;
  rosterHidden: boolean;
}

/**
 * Everything a staff member's own read-only view needs, capability-gated:
 * roster names behind roster_names, DOB + custom-question answers behind
 * roster_sensitive (the PIPEDA-critical toggle), schedule behind schedule.
 */
export async function staffSelfView(staff: Staff, opts?: { capsOverride?: Record<string, ResolvedCapability> }): Promise<{
  caps: Record<string, ResolvedCapability>;
  programs: SelfViewProgram[];
  pay: Array<{ dueDate: string; amountCents: number; status: string; programName: string }>;
  unavailability: Array<{ date: string; note: string | null }>;
}> {
  const db = supabaseAdmin();
  const caps = opts?.capsOverride ?? (staff.profile_id ? await capabilitiesForProfile(staff.profile_id) : {});
  const showSchedule = can(caps, 'schedule');
  const showNames = can(caps, 'roster_names');
  const showSensitive = can(caps, 'roster_sensitive');

  const { data: assigns } = await db
    .from('staff_assignments')
    .select('id, program_id, role_label, active, programs(name)')
    .eq('staff_id', staff.id)
    .eq('active', true);

  const nowISO = new Date().toISOString();
  const programs: SelfViewProgram[] = [];
  for (const a of assigns ?? []) {
    const programName = (a.programs as unknown as { name: string } | null)?.name ?? `Program ${a.program_id}`;

    let sessions: SelfViewProgram['sessions'] = [];
    if (showSchedule) {
      const { data: sess } = await db.from('program_sessions').select('starts_at, ends_at').eq('program_id', a.program_id).gte('starts_at', nowISO).order('starts_at').limit(12);
      sessions = (sess ?? []).map((s) => ({ startsAt: s.starts_at, endsAt: s.ends_at }));
    }

    let roster: SelfViewProgram['roster'] = [];
    if (showNames) {
      const { data: regs } = await db
        .from('registrations')
        .select('id, family_members(first_name, last_name, dob)')
        .eq('program_id', a.program_id)
        .in('status', ['active', 'waitlisted']);
      roster = await Promise.all(
        (regs ?? []).map(async (r) => {
          const m = r.family_members as unknown as { first_name: string; last_name: string; dob: string | null } | null;
          let answers: Array<{ label: string; answer: string }> = [];
          if (showSensitive) {
            const { data: qa } = await db.from('question_answers').select('answer, questions(label)').eq('registration_id', r.id);
            answers = (qa ?? []).map((q) => ({
              label: (q.questions as unknown as { label: string } | null)?.label ?? 'Answer',
              answer: Array.isArray(q.answer) ? (q.answer as string[]).join(', ') : String(q.answer),
            }));
          }
          return { name: m ? `${m.first_name} ${m.last_name}` : 'Registrant', dob: showSensitive ? (m?.dob ?? null) : null, answers };
        }),
      );
      roster.sort((x, y) => x.name.localeCompare(y.name));
    }

    programs.push({ programId: a.program_id, programName, roleLabel: a.role_label, assignmentId: a.id, sessions, roster, rosterHidden: !showNames });
  }

  const assignIds = (assigns ?? []).map((a) => a.id);
  let pay: Array<{ dueDate: string; amountCents: number; status: string; programName: string }> = [];
  if (assignIds.length) {
    const { data: payRows } = await db.from('staff_pay_dates').select('due_date, amount_cents, status, staff_assignments(programs(name))').in('assignment_id', assignIds).order('due_date');
    pay = (payRows ?? []).map((p) => ({
      dueDate: p.due_date,
      amountCents: p.amount_cents,
      status: p.status,
      programName: (p.staff_assignments as unknown as { programs: { name: string } | null } | null)?.programs?.name ?? '',
    }));
  }

  const { data: unav } = await db.from('staff_unavailability').select('date, note').eq('staff_id', staff.id).gte('date', torontoToday()).order('date');
  return { caps, programs, pay, unavailability: unav ?? [] };
}
