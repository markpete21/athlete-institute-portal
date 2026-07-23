import 'server-only';
import { randomBytes } from 'node:crypto';
import {
  audit,
  deriveStanding,
  type ParticipantStanding,
  type ProgramCategory,
  type ProrationMethod,
} from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createRecurringBookings } from '@/lib/bookings';

/**
 * Program framework base API (Module 4) - the integration contract each
 * program-type sub-module (Camps M8, Leagues M7, ...) extends. Stage 1:
 * type manager, program spine CRUD, staff assignment, standing derivation,
 * facility sessions via the Module 2 recurrence engine.
 */

export interface ProgramType {
  id: number;
  key: string;
  name: string;
  default_category: ProgramCategory;
  default_proration: ProrationMethod;
  active: boolean;
  sort_order: number;
}

export interface Program {
  id: number;
  name: string;
  description: string | null;
  program_type_id: number;
  category: ProgramCategory;
  sport_tag: string | null;
  season_key: string | null;
  year: number | null;
  brand_key: string;
  min_age: number | null;
  max_age: number | null;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  capacity: number | null;
  proration_method: ProrationMethod;
  base_price_cents: number;
  early_bird_price_cents: number | null;
  early_bird_until: string | null;
  late_fee_cents: number;
  late_fee_after: string | null;
  returning_discount_cents: number | null;
  multi_member_discount_cents: number;
  scholarship_eligible: boolean;
  quickbooks_class: string | null;
  waiver_id: number | null;
  status: string;
  share_token: string;
}

const P_COLS =
  'id, name, description, program_type_id, category, sport_tag, season_key, year, brand_key, min_age, max_age, registration_opens_at, registration_closes_at, capacity, proration_method, base_price_cents, early_bird_price_cents, early_bird_until, late_fee_cents, late_fee_after, returning_discount_cents, multi_member_discount_cents, scholarship_eligible, quickbooks_class, waiver_id, status, share_token';

// --- Types ------------------------------------------------------------------

export async function listProgramTypes(includeInactive = false): Promise<ProgramType[]> {
  let q = supabaseAdmin().from('program_types').select('id, key, name, default_category, default_proration, active, sort_order').order('sort_order');
  if (!includeInactive) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ProgramType[];
}

export async function upsertProgramType(
  input: { id?: number; key: string; name: string; defaultCategory: ProgramCategory; defaultProration: ProrationMethod; active?: boolean },
  actorClerkId: string,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('program_types')
    .upsert(
      {
        ...(input.id ? { id: input.id } : {}),
        key: input.key.trim().toLowerCase(),
        name: input.name.trim(),
        default_category: input.defaultCategory,
        default_proration: input.defaultProration,
        active: input.active ?? true,
      },
      { onConflict: 'key' },
    );
  if (error) throw new Error(`program type save failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'program_type.saved', target: `program_type:${input.key}`, meta: { name: input.name } });
}

// --- Programs ---------------------------------------------------------------

export interface CreateProgramInput {
  name: string;
  programTypeId: number;
  category?: ProgramCategory;      // defaults from the type
  description?: string | null;
  sportTag?: string | null;
  seasonKey?: string | null;
  year?: number | null;
  brandKey?: string;
  minAge?: number | null;
  maxAge?: number | null;
  capacity?: number | null;
  quickbooksClass?: string | null;
  actorClerkId: string;
}

/** Create a program, inheriting category + proration from its type (overridable). */
export async function createProgram(input: CreateProgramInput): Promise<Program> {
  const db = supabaseAdmin();
  const { data: type, error: tErr } = await db
    .from('program_types')
    .select('default_category, default_proration')
    .eq('id', input.programTypeId)
    .single();
  if (tErr) throw new Error(`unknown program type: ${tErr.message}`);

  const { data, error } = await db
    .from('programs')
    .insert({
      name: input.name.trim(),
      program_type_id: input.programTypeId,
      category: input.category ?? type.default_category,
      proration_method: type.default_proration,
      description: input.description ?? null,
      sport_tag: input.sportTag ?? null,
      season_key: input.seasonKey ?? null,
      year: input.year ?? null,
      brand_key: input.brandKey ?? 'athlete-institute',
      min_age: input.minAge ?? null,
      max_age: input.maxAge ?? null,
      capacity: input.capacity ?? null,
      quickbooks_class: input.quickbooksClass ?? null,
      share_token: randomBytes(9).toString('base64url'),
      created_by: input.actorClerkId,
    })
    .select(P_COLS)
    .single();
  if (error) throw new Error(`program create failed: ${error.message}`);
  await audit({ actorId: input.actorClerkId, action: 'program.created', target: `program:${data.id}`, meta: { name: input.name, type: input.programTypeId } });

  // Seed the program's questions from its type defaults.
  const { applyTypeDefaults } = await import('@/lib/programs/questions');
  await applyTypeDefaults(data.id, input.programTypeId, input.actorClerkId).catch(() => {});

  return data as Program;
}

export async function getProgram(id: number): Promise<Program | null> {
  const { data, error } = await supabaseAdmin().from('programs').select(P_COLS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Program) ?? null;
}

export async function updateProgram(id: number, patch: Partial<Record<string, unknown>>, actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('programs').update(patch).eq('id', id);
  if (error) throw new Error(`program update failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'program.updated', target: `program:${id}`, meta: { fields: Object.keys(patch) } });
}

export async function setProgramStatus(id: number, status: string, actorClerkId: string): Promise<void> {
  await updateProgram(id, { status }, actorClerkId);
}

// --- Staff assignment -------------------------------------------------------

export async function assignStaff(programId: number, profileId: number, roleLabel: string | null, actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('program_staff')
    .upsert({ program_id: programId, profile_id: profileId, role_label: roleLabel }, { onConflict: 'program_id,profile_id' });
  if (error) throw new Error(`staff assign failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'program.staff-assigned', target: `program:${programId}`, meta: { profile_id: profileId } });
}

export async function unassignStaff(programId: number, profileId: number, actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('program_staff').delete().eq('program_id', programId).eq('profile_id', profileId);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'program.staff-unassigned', target: `program:${programId}`, meta: { profile_id: profileId } });
}

// --- Sessions via Module 2 recurrence --------------------------------------

/**
 * Generate the program's facility sessions through the Module 2 recurrence
 * engine (e.g. clinic every Saturday x6). Each session is a booking; staff can
 * later edit the series or single instances (Module 2 behavior).
 */
export async function generateSessions(input: {
  programId: number;
  facilityId: number;
  pattern: import('@ai/foundation').WeeklyPattern;
  startDate: string;
  startTime: string;
  endTime: string;
  until?: string;
  count?: number;
  actorClerkId: string;
}): Promise<{ sessionCount: number; conflictedDates: string[] }> {
  const db = supabaseAdmin();
  const program = await getProgram(input.programId);
  if (!program) throw new Error('Program not found.');

  const series = await createRecurringBookings({
    facilityId: input.facilityId,
    pattern: input.pattern,
    startDate: input.startDate,
    startTime: input.startTime,
    endTime: input.endTime,
    until: input.until,
    count: input.count,
    source: 'program',
    title: program.name,
    sourceRef: `program:${input.programId}`,
    actorClerkId: input.actorClerkId,
  });

  const rows = series.occurrences.filter(Boolean).map((o) => ({
    program_id: input.programId,
    booking_id: o!.booking.id,
    series_id: series.seriesId,
    starts_at: o!.booking.starts_at,
    ends_at: o!.booking.ends_at,
  }));
  if (rows.length) {
    const { error } = await db.from('program_sessions').insert(rows);
    if (error) throw new Error(`sessions link failed: ${error.message}`);
  }
  await audit({ actorId: input.actorClerkId, action: 'program.sessions-generated', target: `program:${input.programId}`, meta: { count: rows.length } });
  return { sessionCount: rows.length, conflictedDates: series.conflictedDates };
}

// --- Standing derivation (returning athlete) --------------------------------

/**
 * Derive a family member's standing for a program from their registration
 * history (auto - never set by hand). Used at registration (Stage 3) and here
 * so Stage 1 can prove it.
 */
export async function deriveStandingFor(familyMemberId: number, programId: number): Promise<ParticipantStanding> {
  const { data, error } = await supabaseAdmin()
    .from('registrations')
    .select('program_id')
    .eq('family_member_id', familyMemberId)
    .in('status', ['active', 'withdrawn']); // withdrawn still counts as history
  if (error) throw new Error(error.message);
  return deriveStanding((data ?? []) as Array<{ program_id: number }>, programId);
}
