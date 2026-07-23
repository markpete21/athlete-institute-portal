import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';
import {
  attachQuestion,
  createQuestion,
  getMarketingSourceOptions,
  programQuestions,
  saveAnswers,
} from '@/lib/programs/questions';

/**
 * DEV-ONLY: Stage-2 question builder - library create, per-type default auto-
 * attach on program create, per-program attach, required-answer validation,
 * answer persistence, marketing-source list. Cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const questionIds: number[] = [];
  let programId: number | null = null;
  let regId: number | null = null;

  try {
    const types = await listProgramTypes();
    const clinic = types.find((t) => t.key === 'clinic')!;

    // 1. a per-type default question + a free-standing one
    const dietary = await createQuestion({ label: `Dietary needs ${Date.now()}`, qtype: 'long_text', defaultForTypeId: clinic.id, required: true }, 'system:verify');
    const shirt = await createQuestion({ label: `Shirt size ${Date.now()}`, qtype: 'size', options: ['YS', 'YM', 'AS', 'AM', 'AL'] }, 'system:verify');
    questionIds.push(dietary.id, shirt.id);
    record('question create (default-for-type + size options)', dietary.default_for_type_id === clinic.id && shirt.options.length === 5, `size opts ${shirt.options.length}`);

    // 2. new clinic auto-attaches the type-default question
    const prog = await createProgram({ name: 'Q Verify Clinic', programTypeId: clinic.id, actorClerkId: 'system:verify' });
    programId = prog.id;
    let attached = await programQuestions(prog.id);
    record('type default auto-attached on create', attached.some((q) => q.id === dietary.id), `${attached.length} attached`);

    // 3. attach the free-standing question too
    await attachQuestion(prog.id, shirt.id, 'system:verify');
    attached = await programQuestions(prog.id);
    record('manual attach + ordering', attached.length === 2 && attached[0].sort_order < attached[1].sort_order, `${attached.length} attached`);

    // 4. required-answer validation blocks missing, then saves
    const { data: fam } = await db.from('families').insert({ name: 'Q Verify Fam' }).select('id').single();
    const { data: reg } = await db.from('registrations').insert({ program_id: prog.id, family_id: fam!.id, status: 'active' }).select('id').single();
    regId = reg!.id;
    let blocked = false;
    try { await saveAnswers(reg!.id, prog.id, { [shirt.id]: 'AM' }); } catch (e) { blocked = e instanceof Error && e.message.includes('Dietary'); }
    record('required question blocks incomplete answers', blocked, 'missing required flagged');

    await saveAnswers(reg!.id, prog.id, { [dietary.id]: 'None', [shirt.id]: 'AM' });
    const { data: saved } = await db.from('question_answers').select('question_id, answer').eq('registration_id', reg!.id);
    record('answers persist per registrant', (saved ?? []).length === 2, `${(saved ?? []).length} answers`);

    // 5. marketing source list present
    const sources = await getMarketingSourceOptions();
    record('marketing-source list seeded', sources.includes('Instagram') && sources.includes('Word of Mouth'), `${sources.length} options`);
    await db.from('families').delete().eq('id', fam!.id);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (regId) await db.from('question_answers').delete().eq('registration_id', regId);
    if (programId) { await db.from('registrations').delete().eq('program_id', programId); await db.from('programs').delete().eq('id', programId); }
    if (questionIds.length) await db.from('questions').delete().in('id', questionIds);
    record('cleanup', true, 'questions, program removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
