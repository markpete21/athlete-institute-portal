import 'server-only';
import { randomBytes } from 'node:crypto';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { applyPlayPoints } from '@/lib/credits';
import { fireTrigger } from '@/lib/comms/notifications';

/**
 * Feedback & Ratings (Module 15). Rolling out-of-5 per program from ONE
 * rating-of-record question; quick review (50 pts) vs full form (250 pts);
 * auto-prompt rounds (end for everything, mid+post for Club/Academy) with one
 * reminder; attributed internally, anonymous on display; 1-2 star responses
 * alert staff immediately.
 */

export const QUICK_REVIEW_POINTS = 50;
export const FULL_FORM_POINTS = 250;

// --- rating model -------------------------------------------------------------

export interface RatingSummary { average: number | null; responses: number }

/** A program's headline out-of-5 (rating-of-record only). */
export async function programRating(programId: number): Promise<RatingSummary> {
  const { data } = await supabaseAdmin().from('feedback_responses').select('rating').eq('program_id', programId).not('rating', 'is', null).not('submitted_at', 'is', null);
  const ratings = (data ?? []).map((r) => r.rating as number);
  return { average: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null, responses: ratings.length };
}

/** Rollup rating across many programs (type-level, brand-level). */
export async function rollupRating(programIds: number[]): Promise<RatingSummary> {
  if (programIds.length === 0) return { average: null, responses: 0 };
  const { data } = await supabaseAdmin().from('feedback_responses').select('rating').in('program_id', programIds).not('rating', 'is', null).not('submitted_at', 'is', null);
  const ratings = (data ?? []).map((r) => r.rating as number);
  return { average: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null, responses: ratings.length };
}

/** Brand/type rollups by looking up member programs. */
export async function ratingForBrand(brandKey: string): Promise<RatingSummary> {
  const { data } = await supabaseAdmin().from('programs').select('id').eq('brand_key', brandKey);
  return rollupRating((data ?? []).map((p) => p.id));
}

export async function ratingForType(programTypeKey: string): Promise<RatingSummary> {
  const { data } = await supabaseAdmin().from('programs').select('id, program_types!inner(key)').eq('program_types.key', programTypeKey);
  return rollupRating((data ?? []).map((p) => p.id));
}

// --- rounds + auto-prompting ----------------------------------------------------

/**
 * Configure a program's feedback rounds from its type: everything gets an END
 * round 1-2 days after the last session; Club/Academy also get a MID round at
 * the season midpoint. Staff-overridable (delayDays / explicit dates).
 */
export async function configureRounds(programId: number, opts: { delayDays?: number } = {}): Promise<Array<{ round: string; promptAt: string }>> {
  const db = supabaseAdmin();
  const { data: prog } = await db.from('programs').select('id, program_types(key)').eq('id', programId).single();
  const typeKey = (prog?.program_types as unknown as { key: string } | null)?.key ?? 'other';
  const { data: sessions } = await db.from('program_sessions').select('starts_at, ends_at').eq('program_id', programId).order('starts_at');
  const rows = sessions ?? [];
  const delay = (opts.delayDays ?? 1) * 86_400_000;

  const out: Array<{ round: string; promptAt: string }> = [];
  const lastEnd = rows.length ? Date.parse(rows[rows.length - 1].ends_at) : Date.now();
  out.push({ round: 'end', promptAt: new Date(lastEnd + delay).toISOString() });

  if (['club', 'academy'].includes(typeKey) && rows.length >= 2) {
    const mid = (Date.parse(rows[0].starts_at) + lastEnd) / 2;
    out.push({ round: 'mid', promptAt: new Date(mid).toISOString() });
  }

  for (const r of out) {
    await db.from('feedback_rounds').upsert({ program_id: programId, round: r.round, prompt_at: r.promptAt }, { onConflict: 'program_id,round' });
  }
  return out;
}

/**
 * Fire due prompts (cron): for each unprompted round past its prompt_at, create
 * a pre-identified deep-link response row per active registration and notify
 * the right submitter (HoH for youth; the registrant household generally).
 * Also sends the single reminder 3 days later to non-responders.
 */
export async function processDuePrompts(baseUrl = process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca'): Promise<{ prompted: number; reminded: number }> {
  const db = supabaseAdmin();
  const nowISO = new Date().toISOString();
  let prompted = 0;
  let reminded = 0;

  const { data: due } = await db.from('feedback_rounds').select('id, program_id, round, programs(name)').lte('prompt_at', nowISO).is('prompted_at', null);
  for (const round of due ?? []) {
    const programName = (round.programs as unknown as { name: string } | null)?.name ?? 'your program';
    const { data: regs } = await db.from('registrations').select('id, family_id').eq('program_id', round.program_id).eq('status', 'active');
    for (const reg of regs ?? []) {
      const token = randomBytes(12).toString('base64url');
      const { data: resp, error } = await db
        .from('feedback_responses')
        .upsert({ round_id: round.id, program_id: round.program_id, registration_id: reg.id, family_id: reg.family_id, token }, { onConflict: 'round_id,registration_id', ignoreDuplicates: true })
        .select('id, token')
        .maybeSingle();
      if (error || !resp) continue;
      const email = await householdEmail(reg.family_id);
      if (email) await fireTrigger('feedback.prompt', { email }, { program_name: programName, form_url: `${baseUrl}/feedback/${resp.token}` });
      prompted += 1;
    }
    await db.from('feedback_rounds').update({ prompted_at: nowISO }).eq('id', round.id);
  }

  // One reminder to non-responders, 3+ days after prompt, then drop.
  const { data: remindable } = await db
    .from('feedback_rounds').select('id, program_id, programs(name)')
    .not('prompted_at', 'is', null).is('reminded_at', null)
    .lte('prompted_at', new Date(Date.now() - 3 * 86_400_000).toISOString());
  for (const round of remindable ?? []) {
    const programName = (round.programs as unknown as { name: string } | null)?.name ?? 'your program';
    const { data: pending } = await db.from('feedback_responses').select('token, family_id').eq('round_id', round.id).is('submitted_at', null);
    for (const p of pending ?? []) {
      const email = await householdEmail(p.family_id);
      if (email) await fireTrigger('feedback.reminder', { email }, { program_name: programName, form_url: `${baseUrl}/feedback/${p.token}` });
      reminded += 1;
    }
    await db.from('feedback_rounds').update({ reminded_at: nowISO }).eq('id', round.id);
  }
  return { prompted, reminded };
}

async function householdEmail(familyId: number | null): Promise<string | null> {
  if (!familyId) return null;
  const db = supabaseAdmin();
  const { data: fam } = await db.from('families').select('hoh_profile_id').eq('id', familyId).maybeSingle();
  if (!fam?.hoh_profile_id) return null;
  const { data: prof } = await db.from('profiles').select('email').eq('id', fam.hoh_profile_id).maybeSingle();
  return prof?.email ?? null;
}

// --- submission ------------------------------------------------------------------

export interface FormView {
  token: string;
  programName: string;
  participantName: string;
  submitted: boolean;
  questions: Array<{ key: string; label: string; type: string; options?: string[] }>;
}

/** Load the pre-identified deep-link form (no login friction). */
export async function formByToken(token: string): Promise<FormView | null> {
  const db = supabaseAdmin();
  const { data: resp } = await db
    .from('feedback_responses')
    .select('token, submitted_at, programs(name, program_types(key)), registrations(family_members(first_name, last_name)), feedback_rounds(form_id)')
    .eq('token', token).maybeSingle();
  if (!resp) return null;
  const prog = resp.programs as unknown as { name: string; program_types: { key: string } | null };
  const member = (resp.registrations as unknown as { family_members: { first_name: string; last_name: string } | null })?.family_members;

  // Round's form, else the type default, else the quick review.
  const formId = (resp.feedback_rounds as unknown as { form_id: number | null } | null)?.form_id;
  let form = formId ? (await db.from('feedback_forms').select('questions').eq('id', formId).maybeSingle()).data : null;
  if (!form) form = (await db.from('feedback_forms').select('questions').eq('program_type_key', prog.program_types?.key ?? '').maybeSingle()).data;
  if (!form) form = (await db.from('feedback_forms').select('questions').eq('name', 'Quick review').maybeSingle()).data;

  return {
    token,
    programName: prog.name,
    participantName: member ? `${member.first_name} ${member.last_name}` : 'your athlete',
    submitted: !!resp.submitted_at,
    questions: (form?.questions ?? []) as FormView['questions'],
  };
}

export interface SubmitResult { pointsAwarded: number; lowScoreAlerted: boolean }

/**
 * Submit feedback via the deep link. Star-only = quick review (50 pts); with
 * full-form answers = 250 pts. Points credit ONCE per response; one response per
 * registration per round is enforced by the unique constraint + submitted guard.
 * A 1-2 star rating-of-record alerts staff immediately (attributed).
 */
export async function submitFeedback(token: string, input: { rating: number; comment?: string | null; answers?: Record<string, unknown> | null }): Promise<SubmitResult> {
  const db = supabaseAdmin();
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new Error('Rating must be 1-5 stars.');
  const { data: resp, error } = await db
    .from('feedback_responses')
    .select('id, submitted_at, family_id, program_id, points_credited, programs(name), registrations(family_members(first_name, last_name))')
    .eq('token', token).single();
  if (error) throw new Error('Feedback link not found.');
  if (resp.submitted_at) throw new Error('This feedback has already been submitted.');

  const hasFullAnswers = !!input.answers && Object.keys(input.answers).length > 0;
  const kind = hasFullAnswers ? 'full' : 'quick';
  const points = hasFullAnswers ? FULL_FORM_POINTS : QUICK_REVIEW_POINTS;

  await db.from('feedback_responses').update({
    rating: input.rating, comment: input.comment ?? null, answers: input.answers ?? null,
    kind, submitted_at: new Date().toISOString(), points_credited: resp.family_id ? points : 0,
  }).eq('id', resp.id);

  // Auto-credit Play Points to the household ledger (once - guarded above).
  let pointsAwarded = 0;
  if (resp.family_id) {
    await applyPlayPoints(resp.family_id, points, `feedback:${kind}`, 'system:feedback', `feedback_response:${resp.id}`);
    pointsAwarded = points;
  }

  // Low score -> immediate attributed staff alert.
  let lowScoreAlerted = false;
  if (input.rating <= 2) {
    const member = (resp.registrations as unknown as { family_members: { first_name: string; last_name: string } | null })?.family_members;
    const staffEmail = process.env.OPERATIONS_EMAIL ?? null;
    if (staffEmail) {
      await fireTrigger('feedback.low_score', { email: staffEmail }, {
        program_name: (resp.programs as unknown as { name: string } | null)?.name ?? 'program',
        respondent: member ? `${member.first_name} ${member.last_name}` : `family ${resp.family_id}`,
        rating: input.rating,
        comment: input.comment ?? '(no comment)',
      });
    }
    lowScoreAlerted = true;
  }

  await audit({ actorId: 'system:feedback', action: 'feedback.submitted', target: `feedback_response:${resp.id}`, meta: { rating: input.rating, kind, pointsAwarded, lowScoreAlerted } });
  return { pointsAwarded, lowScoreAlerted };
}

// --- display + AI summaries --------------------------------------------------------

export interface AnonymousReview { rating: number; comment: string | null; submittedAt: string }

/** Anonymous display view - identity stripped (public/surfaced use). */
export async function anonymousReviews(programId: number): Promise<AnonymousReview[]> {
  const { data } = await supabaseAdmin()
    .from('feedback_responses')
    .select('rating, comment, submitted_at')
    .eq('program_id', programId).not('submitted_at', 'is', null).not('rating', 'is', null)
    .order('submitted_at', { ascending: false });
  return (data ?? []).map((r) => ({ rating: r.rating!, comment: r.comment, submittedAt: r.submitted_at! }));
}

/** Attributed internal view (staff): who said what. */
export async function attributedResponses(programId: number): Promise<Array<{ respondent: string; rating: number | null; comment: string | null; kind: string | null }>> {
  const { data } = await supabaseAdmin()
    .from('feedback_responses')
    .select('rating, comment, kind, registrations(family_members(first_name, last_name))')
    .eq('program_id', programId).not('submitted_at', 'is', null);
  return (data ?? []).map((r) => {
    const m = (r.registrations as unknown as { family_members: { first_name: string; last_name: string } | null })?.family_members;
    return { respondent: m ? `${m.first_name} ${m.last_name}` : 'Unknown', rating: r.rating, comment: r.comment, kind: r.kind };
  });
}

/**
 * Claude per-round summary (claude-sonnet-4-6): themes, praise, fixes, quotes -
 * ANONYMIZED (identities never sent to the model). Falls back to a stats line
 * when ANTHROPIC_API_KEY is unset.
 */
export async function summarizeFeedback(programId: number, roundId?: number | null): Promise<{ summary: string; source: 'claude' | 'fallback' }> {
  const db = supabaseAdmin();
  const reviews = await anonymousReviews(programId);
  const rating = await programRating(programId);
  const fallback = `Rating ${rating.average ?? 'n/a'}/5 across ${rating.responses} responses. ${reviews.filter((r) => r.rating <= 2).length} low scores.`;

  const key = process.env.ANTHROPIC_API_KEY;
  let summary = fallback;
  let source: 'claude' | 'fallback' = 'fallback';
  if (key && reviews.length) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: 800,
          system: 'Summarize program feedback for staff: key themes, what parents praised, what to fix, 1-2 notable anonymized quotes. Never invent or expose identities. Be concise (under 200 words).',
          messages: [{ role: 'user', content: JSON.stringify(reviews.map((r) => ({ rating: r.rating, comment: r.comment }))) }],
        }),
        cache: 'no-store',
      });
      if (res.ok) {
        const json = await res.json();
        summary = (json.content ?? []).map((c: { text?: string }) => c.text ?? '').join('') || fallback;
        source = 'claude';
      }
    } catch { /* fall back */ }
  }

  await db.from('feedback_summaries').insert({ program_id: programId, round_id: roundId ?? null, summary, model: source === 'claude' ? 'claude-sonnet-4-6' : null });
  return { summary, source };
}
