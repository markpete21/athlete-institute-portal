import 'server-only';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Custom question builder (Module 4 Stage 2). A reusable library + per-program
 * attachments + per-registrant answers. Plus the one standardized global
 * "where did you hear about us" question (managed answer list, asked once per
 * registration).
 */

export type QType = 'short_text' | 'long_text' | 'single_choice' | 'multi_choice' | 'number' | 'date' | 'file' | 'size';

export interface Question {
  id: number;
  label: string;
  help_text: string | null;
  qtype: QType;
  options: string[];
  required: boolean;
  default_for_type_id: number | null;
  archived: boolean;
}

export interface ProgramQuestion extends Question {
  program_question_id: number;
  sort_order: number;
  required_effective: boolean;
}

const Q_COLS = 'id, label, help_text, qtype, options, required, default_for_type_id, archived';

export async function listQuestions(includeArchived = false): Promise<Question[]> {
  let q = supabaseAdmin().from('questions').select(Q_COLS).order('label');
  if (!includeArchived) q = q.eq('archived', false);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Question[];
}

export async function createQuestion(
  input: { label: string; qtype: QType; helpText?: string | null; options?: string[]; required?: boolean; defaultForTypeId?: number | null },
  actorClerkId: string,
): Promise<Question> {
  const needsOptions = input.qtype === 'single_choice' || input.qtype === 'multi_choice' || input.qtype === 'size';
  const { data, error } = await supabaseAdmin()
    .from('questions')
    .insert({
      label: input.label.trim(),
      qtype: input.qtype,
      help_text: input.helpText ?? null,
      options: needsOptions ? input.options ?? [] : [],
      required: input.required ?? false,
      default_for_type_id: input.defaultForTypeId ?? null,
      created_by: actorClerkId,
    })
    .select(Q_COLS)
    .single();
  if (error) throw new Error(`question create failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'question.created', target: `question:${data.id}`, meta: { label: input.label, qtype: input.qtype } });
  return data as Question;
}

export async function updateQuestion(id: number, patch: Partial<Record<string, unknown>>, actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('questions').update(patch).eq('id', id);
  if (error) throw new Error(`question update failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'question.updated', target: `question:${id}`, meta: { fields: Object.keys(patch) } });
}

/** Attach a question to a program (append at the end). */
export async function attachQuestion(programId: number, questionId: number, actorClerkId: string, requiredOverride?: boolean | null): Promise<void> {
  const db = supabaseAdmin();
  const { data: last } = await db.from('program_questions').select('sort_order').eq('program_id', programId).order('sort_order', { ascending: false }).limit(1);
  const { error } = await db
    .from('program_questions')
    .upsert({ program_id: programId, question_id: questionId, sort_order: ((last?.[0]?.sort_order as number | undefined) ?? 0) + 1, required: requiredOverride ?? null }, { onConflict: 'program_id,question_id' });
  if (error) throw new Error(`attach failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'program.question-attached', target: `program:${programId}`, meta: { question_id: questionId } });
}

export async function detachQuestion(programId: number, questionId: number, actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('program_questions').delete().eq('program_id', programId).eq('question_id', questionId);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'program.question-detached', target: `program:${programId}`, meta: { question_id: questionId } });
}

/**
 * Seed a program's questions from its type defaults - called after program
 * creation (idempotent: skips questions already attached).
 */
export async function applyTypeDefaults(programId: number, programTypeId: number, actorClerkId: string): Promise<number> {
  const db = supabaseAdmin();
  const { data: defaults } = await db.from('questions').select('id').eq('default_for_type_id', programTypeId).eq('archived', false);
  let n = 0;
  for (const q of defaults ?? []) {
    await attachQuestion(programId, q.id, actorClerkId);
    n++;
  }
  return n;
}

/** The program's attached questions in order, with effective required flag. */
export async function programQuestions(programId: number): Promise<ProgramQuestion[]> {
  const { data, error } = await supabaseAdmin()
    .from('program_questions')
    .select('id, sort_order, required, questions(id, label, help_text, qtype, options, required, default_for_type_id, archived)')
    .eq('program_id', programId)
    .order('sort_order');
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const q = row.questions as unknown as Question;
    return {
      ...q,
      program_question_id: row.id as number,
      sort_order: row.sort_order as number,
      required_effective: (row.required as boolean | null) ?? q.required,
    };
  });
}

/** Validate + save a registrant's answers (throws listing any missing required). */
export async function saveAnswers(registrationId: number, programId: number, answers: Record<number, unknown>): Promise<void> {
  const db = supabaseAdmin();
  const questions = await programQuestions(programId);
  const missing = questions
    .filter((q) => q.required_effective)
    .filter((q) => {
      const a = answers[q.id];
      if (a == null) return true;
      if (Array.isArray(a)) return a.length === 0;
      return String(a).trim() === '';
    })
    .map((q) => q.label);
  if (missing.length) throw new Error(`Please answer: ${missing.join(', ')}`);

  const rows = Object.entries(answers)
    .filter(([, v]) => v != null && !(Array.isArray(v) && v.length === 0))
    .map(([qid, v]) => ({ registration_id: registrationId, question_id: Number(qid), answer: v as object }));
  if (rows.length) {
    const { error } = await db.from('question_answers').upsert(rows, { onConflict: 'registration_id,question_id' });
    if (error) throw new Error(`answers save failed: ${error.message}`);
  }
}

// --- Standardized global marketing-source question --------------------------

export async function getMarketingSourceOptions(): Promise<string[]> {
  const { data } = await supabaseAdmin().from('portal_settings').select('value').eq('key', 'marketing_source_options').maybeSingle();
  return (data?.value as string[] | undefined) ?? [];
}

export async function setMarketingSourceOptions(options: string[], actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('portal_settings').upsert({ key: 'marketing_source_options', value: options }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'marketing_source.updated', target: 'portal_settings:marketing_source_options', meta: { count: options.length } });
}
