'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { ProgramCategory, ProrationMethod } from '@ai/foundation';
import { getPortalSession } from '@/lib/auth';
import { assignStaff, createProgram, generateSessions, setProgramStatus, unassignStaff, updateProgram, upsertProgramType } from '@/lib/programs/programs';

async function requireStaff() {
  const session = await getPortalSession();
  if (!session.isStaff) throw new Error('Staff only.');
  return session;
}

/** Module 22: "Draft with AI" - generates an on-brand description from the
 * program's structured fields; the draft lands in the description field for
 * staff to edit + approve (never auto-publishes). */
export async function draftDescriptionAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const programId = Number(formData.get('programId'));
  const { draftProgramDescription } = await import('@/lib/ai/enhancements');
  const { draft } = await draftProgramDescription(programId, session.userId!);
  await updateProgram(programId, { description: draft }, session.userId!);
  revalidatePath(`/programs/${programId}`);
}

const num = (v: FormDataEntryValue | null): number | null => {
  const s = String(v ?? '').trim();
  return s ? Number(s) : null;
};
const cents = (v: FormDataEntryValue | null): number | null => {
  const s = String(v ?? '').trim();
  return s ? Math.round(Number(s) * 100) : null;
};

export async function saveTypeAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  await upsertProgramType(
    {
      id: formData.get('id') ? Number(formData.get('id')) : undefined,
      key: String(formData.get('key') ?? ''),
      name: String(formData.get('name') ?? ''),
      defaultCategory: String(formData.get('defaultCategory') ?? 'Youth Sports') as ProgramCategory,
      defaultProration: String(formData.get('defaultProration') ?? 'none') as ProrationMethod,
      active: formData.get('active') === 'on',
    },
    session.userId!,
  );
  revalidatePath('/programs/types');
}

export async function createProgramAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const program = await createProgram({
    name: String(formData.get('name') ?? '').trim() || 'Untitled program',
    programTypeId: Number(formData.get('programTypeId')),
    category: (String(formData.get('category') ?? '') || undefined) as ProgramCategory | undefined,
    sportTag: String(formData.get('sportTag') ?? '').trim() || null,
    brandKey: String(formData.get('brandKey') ?? 'athlete-institute'),
    minAge: num(formData.get('minAge')),
    maxAge: num(formData.get('maxAge')),
    capacity: num(formData.get('capacity')),
    actorClerkId: session.userId!,
  });
  redirect(`/programs/${program.id}`);
}

export async function updateProgramAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('programId'));
  await updateProgram(
    id,
    {
      name: String(formData.get('name') ?? '').trim(),
      description: String(formData.get('description') ?? '').trim() || null,
      category: String(formData.get('category') ?? 'Youth Sports'),
      sport_tag: String(formData.get('sportTag') ?? '').trim() || null,
      brand_key: String(formData.get('brandKey') ?? 'athlete-institute'),
      min_age: num(formData.get('minAge')),
      max_age: num(formData.get('maxAge')),
      capacity: num(formData.get('capacity')),
      base_price_cents: cents(formData.get('basePrice')) ?? 0,
      early_bird_price_cents: cents(formData.get('earlyBirdPrice')),
      early_bird_until: String(formData.get('earlyBirdUntil') ?? '') || null,
      late_fee_cents: cents(formData.get('lateFee')) ?? 0,
      late_fee_after: String(formData.get('lateFeeAfter') ?? '') || null,
      returning_discount_cents: cents(formData.get('returningDiscount')),
      multi_member_discount_cents: cents(formData.get('multiMemberDiscount')) ?? 0,
      scholarship_eligible: formData.get('scholarshipEligible') === 'on',
      quickbooks_class: String(formData.get('quickbooksClass') ?? '').trim() || null,
      season_key: String(formData.get('seasonKey') ?? '').trim() || null,
      proration_method: String(formData.get('prorationMethod') ?? 'none'),
    },
    session.userId!,
  );
  revalidatePath(`/programs/${id}`);
}

export async function setStatusAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('programId'));
  await setProgramStatus(id, String(formData.get('status')), session.userId!);
  revalidatePath(`/programs/${id}`);
}

export async function assignStaffAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('programId'));
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const { supabaseAdmin } = await import('@ai/foundation/supabase');
  const { data: prof } = await supabaseAdmin().from('profiles').select('id').eq('email', email).maybeSingle();
  if (!prof) throw new Error(`No account for ${email} - they must sign in once first.`);
  await assignStaff(id, prof.id, String(formData.get('roleLabel') ?? '').trim() || null, session.userId!);
  revalidatePath(`/programs/${id}`);
}

export async function unassignStaffAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('programId'));
  await unassignStaff(id, Number(formData.get('profileId')), session.userId!);
  revalidatePath(`/programs/${id}`);
}

export async function configureLeagueAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('programId'));
  const { configureLeague } = await import('@/lib/leagues/leagues');
  const paths = ['captain', 'member', 'small_group', 'free_agent'].filter((p) => formData.get(`path_${p}`) === 'on') as ('captain' | 'member' | 'small_group' | 'free_agent')[];
  await configureLeague({ programId: id, pricing: String(formData.get('pricing') ?? 'player') as 'player' | 'team' | 'both', teamRateCents: Math.round(Number(formData.get('teamRate') ?? 0) * 100) || 0, paths: paths.length ? paths : undefined }, session.userId!);
  revalidatePath(`/programs/${id}`);
}

export async function attachProgramWaiverAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('programId'));
  const { attachWaiverToProgram } = await import('@/lib/waivers');
  await attachWaiverToProgram(id, formData.get('waiverId') ? Number(formData.get('waiverId')) : null, session.userId!);
  revalidatePath(`/programs/${id}`);
}

export async function attachQuestionAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('programId'));
  const { attachQuestion } = await import('@/lib/programs/questions');
  await attachQuestion(id, Number(formData.get('questionId')), session.userId!);
  revalidatePath(`/programs/${id}`);
}

export async function detachQuestionAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('programId'));
  const { detachQuestion } = await import('@/lib/programs/questions');
  await detachQuestion(id, Number(formData.get('questionId')), session.userId!);
  revalidatePath(`/programs/${id}`);
}

export async function generateSessionsAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('programId'));
  const weekdays = formData.getAll('weekday').map((w) => Number(w));
  await generateSessions({
    programId: id,
    facilityId: Number(formData.get('facilityId')),
    pattern: { freq: 'weekly', byWeekday: weekdays.length ? weekdays : [Number(formData.get('weekdaySingle') ?? 6)] },
    startDate: String(formData.get('startDate')),
    startTime: String(formData.get('startTime')),
    endTime: String(formData.get('endTime')),
    until: String(formData.get('until') ?? '') || undefined,
    count: formData.get('count') ? Number(formData.get('count')) : undefined,
    actorClerkId: session.userId!,
  });
  revalidatePath(`/programs/${id}`);
}
