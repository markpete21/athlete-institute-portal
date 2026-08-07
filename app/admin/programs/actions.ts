'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { ProgramCategory, ProrationMethod } from '@ai/foundation';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { BUCKETS, getPublicUrl, uploadFile } from '@ai/foundation/storage';
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
    seasonKey: String(formData.get('seasonKey') ?? '').trim() || null,
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

/* ------------------------------------------------------------------ */
/* Compete brand & sponsors (migration 0056)                          */
/* ------------------------------------------------------------------ */

const BRAND_IMG_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const HERO_TYPES = [...BRAND_IMG_TYPES, 'video/mp4', 'video/webm'];
const MAX_BRAND_BYTES = 2 * 1024 * 1024;
const MAX_HERO_BYTES = 24 * 1024 * 1024;

async function putBrandFile(programId: number, slot: string, file: File, allowed: string[], maxBytes: number): Promise<string> {
  if (file.size > maxBytes) throw new Error(`${slot} must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.`);
  if (!allowed.includes(file.type)) throw new Error(`${slot} must be one of: ${allowed.join(', ')}`);
  const ext = (file.name.split('.').pop() ?? 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  // Timestamped so a re-upload busts CDN caches, same as booking logos.
  const path = `compete-brand/${programId}/${slot}-${Date.now()}.${ext}`;
  await uploadFile(BUCKETS.eventLogos, path, await file.arrayBuffer(), { contentType: file.type, upsert: true });
  return getPublicUrl(BUCKETS.eventLogos, path);
}

/** Colours, logo, hero media and tickets link for the program's Compete
 *  landing page. Files are optional on every save; existing media stays
 *  unless replaced. */
export async function saveCompeteBrandAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const programId = Number(formData.get('programId'));
  const db = supabaseAdmin();
  const { data: prog } = await db.from('programs').select('compete_brand').eq('id', programId).maybeSingle();
  if (!prog) throw new Error('Program not found.');
  const brand = { ...(prog.compete_brand as Record<string, unknown> ?? {}) };

  const hex = (v: FormDataEntryValue | null) => {
    const s = String(v ?? '').trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(s) ? s : null;
  };
  brand.primary = hex(formData.get('primary')) ?? brand.primary ?? '#1e1e1e';
  brand.accent = hex(formData.get('accent')) ?? brand.accent ?? '#9e8959';

  const logo = formData.get('logo');
  if (logo instanceof File && logo.size > 0) {
    brand.logoUrl = await putBrandFile(programId, 'logo', logo, BRAND_IMG_TYPES, MAX_BRAND_BYTES);
  }
  const hero = formData.get('hero');
  if (hero instanceof File && hero.size > 0) {
    brand.heroUrl = await putBrandFile(programId, 'hero', hero, HERO_TYPES, MAX_HERO_BYTES);
    brand.heroType = hero.type.startsWith('video') ? 'video' : 'image';
  }
  if (formData.get('clearLogo') === 'on') { brand.logoUrl = null; }
  if (formData.get('clearHero') === 'on') { brand.heroUrl = null; brand.heroType = null; }

  const ticketsUrl = String(formData.get('ticketsUrl') ?? '').trim();
  const ticketsOn = formData.get('ticketsOn') === 'on';

  const { error } = await db
    .from('programs')
    .update({ compete_brand: brand, tickets_url: ticketsOn && ticketsUrl ? ticketsUrl : null })
    .eq('id', programId);
  if (error) throw new Error(error.message);
  await audit({
    actorId: session.userId!,
    action: 'program.compete-brand',
    target: `program:${programId}`,
    meta: { primary: brand.primary, accent: brand.accent, hasLogo: !!brand.logoUrl, hasHero: !!brand.heroUrl, tickets: ticketsOn && !!ticketsUrl },
  });
  revalidatePath(`/programs/${programId}`);
}

export async function addSponsorAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const programId = Number(formData.get('programId'));
  const name = String(formData.get('name') ?? '').trim();
  if (!name) throw new Error('Sponsor name is required.');
  let logoUrl: string | null = null;
  const logo = formData.get('logo');
  if (logo instanceof File && logo.size > 0) {
    logoUrl = await putBrandFile(programId, `sponsor-${Date.now()}`, logo, BRAND_IMG_TYPES, MAX_BRAND_BYTES);
  }
  const db = supabaseAdmin();
  const { data: last } = await db.from('compete_sponsors').select('sort').eq('program_id', programId).order('sort', { ascending: false }).limit(1);
  const { error } = await db.from('compete_sponsors').insert({ program_id: programId, name, logo_url: logoUrl, sort: (last?.[0]?.sort ?? 0) + 1 });
  if (error) throw new Error(error.message);
  await audit({ actorId: session.userId!, action: 'program.sponsor-add', target: `program:${programId}`, meta: { name } });
  revalidatePath(`/programs/${programId}`);
}

export async function removeSponsorAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('sponsorId'));
  const programId = Number(formData.get('programId'));
  const { error } = await supabaseAdmin().from('compete_sponsors').delete().eq('id', id).eq('program_id', programId);
  if (error) throw new Error(error.message);
  await audit({ actorId: session.userId!, action: 'program.sponsor-remove', target: `program:${programId}`, meta: { sponsorId: id } });
  revalidatePath(`/programs/${programId}`);
}
