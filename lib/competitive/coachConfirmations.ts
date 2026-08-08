import 'server-only';
import { randomBytes } from 'crypto';
import { audit } from '@ai/foundation';
import { notify } from '@ai/foundation/notify';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Coach confirmations (division ops). Stage 1 of building a season: assign a
 * coach to each team, send one-click confirmation emails, and collect answers
 * to staff-defined custom questions (practice night, meeting RSVP, ...).
 *
 * The link is a PUBLIC token page (/coach-confirm/[token]) so a coach never
 * needs an account to confirm - same trust model as rental quote signing.
 * Re-assigning a team's coach deletes its confirmation so a stale confirm can
 * never carry over to a different person.
 */

export interface CoachBoardRow {
  teamId: number;
  teamName: string;
  staffId: number | null;
  coachName: string | null;
  coachEmail: string | null;
  status: 'unassigned' | 'not_sent' | 'pending' | 'confirmed' | 'declined';
  answers: Record<string, string> | null;
  note: string | null;
  token: string | null;
  sentAt: string | null;
  respondedAt: string | null;
}

/** Per-team coach + confirmation status for the admin division page. */
export async function coachBoard(divisionId: number): Promise<{ rows: CoachBoardRow[]; questions: string[] }> {
  const db = supabaseAdmin();
  const [{ data: div }, { data: teams }, { data: confs }] = await Promise.all([
    db.from('divisions').select('coach_questions').eq('id', divisionId).single(),
    db.from('teams').select('id, name, sort_order, coach_staff_id, staff(id, first_name, last_name, email)').eq('division_id', divisionId).order('sort_order'),
    db.from('coach_confirmations').select('team_id, status, answers, note, token, sent_at, responded_at').eq('division_id', divisionId),
  ]);
  const confByTeam = new Map((confs ?? []).map((c) => [c.team_id, c]));
  const rows: CoachBoardRow[] = (teams ?? []).map((t) => {
    const staff = t.staff as unknown as { id: number; first_name: string; last_name: string; email: string | null } | null;
    const conf = confByTeam.get(t.id);
    return {
      teamId: t.id,
      teamName: t.name,
      staffId: staff?.id ?? null,
      coachName: staff ? `${staff.first_name} ${staff.last_name}` : null,
      coachEmail: staff?.email ?? null,
      status: !staff ? 'unassigned' : !conf ? 'not_sent' : (conf.status as 'pending' | 'confirmed' | 'declined'),
      answers: (conf?.answers as Record<string, string> | null) ?? null,
      note: conf?.note ?? null,
      token: conf?.token ?? null,
      sentAt: conf?.sent_at ?? null,
      respondedAt: conf?.responded_at ?? null,
    };
  });
  return { rows, questions: ((div?.coach_questions as string[] | null) ?? []).filter((q) => typeof q === 'string') };
}

/** Assign/clear a team's coach. Clears any confirmation - a new person must re-confirm. */
export async function setTeamCoach(teamId: number, staffId: number | null, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from('teams').update({ coach_staff_id: staffId }).eq('id', teamId);
  if (error) throw new Error(error.message);
  await db.from('coach_confirmations').delete().eq('team_id', teamId);
  await audit({ actorId: actorClerkId, action: 'team.coach-set', target: `team:${teamId}`, meta: { staffId } });
}

/** Staff-defined custom questions on the confirmation form (labels, in order). */
export async function saveCoachQuestions(divisionId: number, questions: string[], actorClerkId: string): Promise<void> {
  const cleaned = questions.map((q) => q.trim()).filter(Boolean).slice(0, 10);
  const { error } = await supabaseAdmin().from('divisions').update({ coach_questions: cleaned }).eq('id', divisionId);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'division.coach-questions', target: `division:${divisionId}`, meta: { count: cleaned.length } });
}

/**
 * Send (or re-send) confirmation requests to every assigned coach that hasn't
 * confirmed yet. Creates the token row even when the coach has no email on
 * file so staff can copy the link manually. Emails silently skip when Resend
 * keys are absent (notify() convention).
 */
export async function sendCoachConfirmations(divisionId: number, actorClerkId: string): Promise<{ sent: number; alreadyConfirmed: number; noEmail: string[] }> {
  const db = supabaseAdmin();
  const { data: div } = await db.from('divisions').select('name, coach_questions, programs(name)').eq('id', divisionId).single();
  if (!div) throw new Error('Division not found.');
  const programName = (div.programs as unknown as { name: string } | null)?.name ?? '';
  const { rows } = await coachBoard(divisionId);
  const questions = ((div.coach_questions as string[] | null) ?? []).filter(Boolean);
  const appUrl = process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca';

  let sent = 0; let alreadyConfirmed = 0; const noEmail: string[] = [];
  for (const row of rows) {
    if (!row.staffId) continue;
    if (row.status === 'confirmed') { alreadyConfirmed++; continue; }
    const token = randomBytes(18).toString('base64url');
    // Replace any pending/declined row so the emailed link is always current.
    await db.from('coach_confirmations').delete().eq('team_id', row.teamId);
    const { error } = await db.from('coach_confirmations').insert({
      division_id: divisionId,
      team_id: row.teamId,
      staff_id: row.staffId,
      token,
      status: 'pending',
      questions,
      sent_at: new Date().toISOString(),
      created_by: actorClerkId,
    });
    if (error) throw new Error(error.message);
    if (!row.coachEmail) { noEmail.push(row.coachName ?? row.teamName); continue; }
    await notify({
      to: { email: row.coachEmail },
      channels: ['email'],
      template: 'generic',
      data: {
        heading: `Confirm coaching: ${row.teamName}`,
        body: `You are listed as the coach of ${row.teamName} (${programName} - ${div.name}). Tap below to confirm - it takes under a minute${questions.length ? ' and asks a couple of quick setup questions' : ''}. If you can't coach this season, the same page lets you decline so we can find a replacement early.`,
        ctaLabel: 'Confirm coaching',
        ctaUrl: `${appUrl}/coach-confirm/${token}`,
      },
    });
    sent++;
  }
  await audit({ actorId: actorClerkId, action: 'division.coach-confirms-sent', target: `division:${divisionId}`, meta: { sent, alreadyConfirmed, noEmail: noEmail.length } });
  return { sent, alreadyConfirmed, noEmail };
}

/** Re-send to coaches still pending (the manual "nudge" button). */
export async function remindPendingCoaches(divisionId: number, actorClerkId: string): Promise<number> {
  const db = supabaseAdmin();
  const { data: pending } = await db
    .from('coach_confirmations')
    .select('id, token, teams(name), staff(first_name, last_name, email), divisions(name)')
    .eq('division_id', divisionId)
    .eq('status', 'pending');
  const appUrl = process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca';
  let reminded = 0;
  for (const c of pending ?? []) {
    const staff = c.staff as unknown as { first_name: string; last_name: string; email: string | null } | null;
    const teamName = (c.teams as unknown as { name: string } | null)?.name ?? 'your team';
    if (!staff?.email) continue;
    await notify({
      to: { email: staff.email },
      channels: ['email'],
      template: 'generic',
      data: {
        heading: `Reminder: confirm coaching ${teamName}`,
        body: `Just a nudge - we still need your coaching confirmation for ${teamName}. It takes under a minute.`,
        ctaLabel: 'Confirm coaching',
        ctaUrl: `${appUrl}/coach-confirm/${c.token}`,
      },
    });
    await db.from('coach_confirmations').update({ reminder_sent_at: new Date().toISOString() }).eq('id', c.id);
    reminded++;
  }
  await audit({ actorId: actorClerkId, action: 'division.coach-confirms-reminded', target: `division:${divisionId}`, meta: { reminded } });
  return reminded;
}

export interface ConfirmationView {
  id: number;
  status: 'pending' | 'confirmed' | 'declined';
  questions: string[];
  answers: Record<string, string> | null;
  note: string | null;
  teamName: string;
  divisionName: string;
  programName: string;
  coachFirstName: string;
}

/** Public token lookup for the confirm page. Null = unknown/revoked link. */
export async function confirmationByToken(token: string): Promise<ConfirmationView | null> {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) return null;
  const db = supabaseAdmin();
  const { data } = await db
    .from('coach_confirmations')
    .select('id, status, questions, answers, note, teams(name), staff(first_name), divisions(name, programs(name))')
    .eq('token', token)
    .maybeSingle();
  if (!data) return null;
  const divs = data.divisions as unknown as { name: string; programs: { name: string } | null } | null;
  return {
    id: data.id,
    status: data.status as ConfirmationView['status'],
    questions: ((data.questions as string[] | null) ?? []).filter(Boolean),
    answers: (data.answers as Record<string, string> | null) ?? null,
    note: data.note ?? null,
    teamName: (data.teams as unknown as { name: string } | null)?.name ?? 'your team',
    divisionName: divs?.name ?? '',
    programName: divs?.programs?.name ?? '',
    coachFirstName: (data.staff as unknown as { first_name: string } | null)?.first_name ?? 'Coach',
  };
}

/** Public response from the token page: confirm (with answers) or decline (with a note). */
export async function respondToConfirmation(token: string, input: { decision: 'confirmed' | 'declined'; answers?: Record<string, string>; note?: string | null }): Promise<void> {
  const db = supabaseAdmin();
  const { data: row } = await db.from('coach_confirmations').select('id, team_id').eq('token', token).maybeSingle();
  if (!row) throw new Error('This confirmation link is no longer valid.');
  const { error } = await db
    .from('coach_confirmations')
    .update({
      status: input.decision,
      answers: input.decision === 'confirmed' ? (input.answers ?? {}) : null,
      note: input.note?.trim() || null,
      responded_at: new Date().toISOString(),
    })
    .eq('id', row.id);
  if (error) throw new Error(error.message);
  await audit({ actorId: `coach-token:${row.team_id}`, action: `coach.${input.decision}`, target: `team:${row.team_id}`, meta: { viaToken: true } });
}
