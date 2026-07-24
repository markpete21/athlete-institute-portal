import 'server-only';
import { audit, spotsRemaining } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Camps front-end (Module 8). Weeks/variations under a camp program, per-week
 * capacity + roster, and mobile check-in/out with authorized pickups. Deposit
 * (20%/$500) + proration live in Module 4; registration/cart/jerseys reuse M4;
 * optional competitive rostering reuses M6.
 */

export interface CampWeek {
  id: number;
  program_id: number;
  name: string;
  start_date: string;
  end_date: string;
  overnight: boolean;
  capacity: number | null;
  price_cents: number;
}

export async function createWeek(input: { programId: number; name: string; startDate: string; endDate: string; dailyStart?: string; dailyEnd?: string; overnight?: boolean; genderBand?: string | null; ageMin?: number | null; ageMax?: number | null; capacity?: number | null; priceCents?: number }, actorClerkId: string): Promise<number> {
  const { data, error } = await supabaseAdmin()
    .from('camp_weeks')
    .insert({ program_id: input.programId, name: input.name.trim(), start_date: input.startDate, end_date: input.endDate, daily_start: input.dailyStart ?? null, daily_end: input.dailyEnd ?? null, overnight: input.overnight ?? false, gender_band: input.genderBand ?? null, age_min: input.ageMin ?? null, age_max: input.ageMax ?? null, capacity: input.capacity ?? null, price_cents: input.priceCents ?? 0 })
    .select('id')
    .single();
  if (error) throw new Error(`week create failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'camp.week-created', target: `camp_week:${data.id}`, meta: { name: input.name } });
  return data.id;
}

export async function listWeeks(programId: number): Promise<Array<CampWeek & { spots_left: number | null }>> {
  const db = supabaseAdmin();
  const { data, error } = await db.from('camp_weeks').select('id, program_id, name, start_date, end_date, overnight, capacity, price_cents').eq('program_id', programId).order('sort_order').order('start_date');
  if (error) throw new Error(error.message);
  const out: Array<CampWeek & { spots_left: number | null }> = [];
  for (const w of data ?? []) {
    const { count } = await db.from('registrations').select('id', { count: 'exact', head: true }).eq('camp_week_id', w.id).eq('status', 'active');
    out.push({ ...(w as CampWeek), spots_left: spotsRemaining(w.capacity, count ?? 0, 0) });
  }
  return out;
}

/** Register a camper into a specific week (per-week capacity → waitlist). */
export async function registerCamper(input: { programId: number; campWeekId: number; familyMemberId: number; familyId: number | null; friendRequest?: string | null; actorClerkId: string }): Promise<{ registrationId: number; waitlisted: boolean }> {
  const db = supabaseAdmin();
  const { deriveStandingFor } = await import('@/lib/programs/programs');
  const { data: week } = await db.from('camp_weeks').select('capacity').eq('id', input.campWeekId).single();
  const { count } = await db.from('registrations').select('id', { count: 'exact', head: true }).eq('camp_week_id', input.campWeekId).eq('status', 'active');
  const left = spotsRemaining(week!.capacity, count ?? 0, 0);
  const waitlisted = left !== null && left <= 0;
  const standing = await deriveStandingFor(input.familyMemberId, input.programId);
  const { data, error } = await db
    .from('registrations')
    .insert({ program_id: input.programId, camp_week_id: input.campWeekId, family_member_id: input.familyMemberId, family_id: input.familyId, standing, status: waitlisted ? 'waitlisted' : 'active', friend_request: input.friendRequest ?? null })
    .select('id')
    .single();
  if (error) throw new Error(`camp registration failed: ${error.message}`);
  await audit({ actorId: input.actorClerkId, action: 'camp.registered', target: `registration:${data.id}`, meta: { week: input.campWeekId, waitlisted } });
  return { registrationId: data.id, waitlisted };
}

// --- Daily check-in / check-out (mobile staff tool) -------------------------

export async function checkIn(input: { registrationId: number; campWeekId: number; dayISO: string; staffClerkId: string }): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('camp_checkins')
    .upsert({ registration_id: input.registrationId, camp_week_id: input.campWeekId, day: input.dayISO, checked_in_at: new Date().toISOString(), staff_clerk_id: input.staffClerkId }, { onConflict: 'registration_id,day' });
  if (error) throw new Error(error.message);
  await audit({ actorId: input.staffClerkId, action: 'camp.checked-in', target: `registration:${input.registrationId}`, meta: { day: input.dayISO } });
}

export async function checkOut(input: { registrationId: number; dayISO: string; authorizedPickup: string; staffClerkId: string }): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('camp_checkins')
    .update({ checked_out_at: new Date().toISOString(), authorized_pickup: input.authorizedPickup })
    .eq('registration_id', input.registrationId)
    .eq('day', input.dayISO);
  if (error) throw new Error(error.message);
  await audit({ actorId: input.staffClerkId, action: 'camp.checked-out', target: `registration:${input.registrationId}`, meta: { day: input.dayISO, pickup: input.authorizedPickup } });
}

/** The day's roster with check-in/out state (for the mobile tool). */
export async function dayRoster(campWeekId: number, dayISO: string): Promise<Array<{ registrationId: number; name: string; checkedIn: boolean; checkedOut: boolean; pickup: string | null }>> {
  const db = supabaseAdmin();
  const { data: regs } = await db.from('registrations').select('id, family_members(first_name, last_name)').eq('camp_week_id', campWeekId).eq('status', 'active');
  const { data: checks } = await db.from('camp_checkins').select('registration_id, checked_in_at, checked_out_at, authorized_pickup').eq('camp_week_id', campWeekId).eq('day', dayISO);
  const byReg = new Map((checks ?? []).map((c) => [c.registration_id, c]));
  return (regs ?? []).map((r) => {
    const m = r.family_members as unknown as { first_name: string; last_name: string } | null;
    const c = byReg.get(r.id);
    return { registrationId: r.id, name: m ? `${m.first_name} ${m.last_name}` : `#${r.id}`, checkedIn: !!c?.checked_in_at, checkedOut: !!c?.checked_out_at, pickup: c?.authorized_pickup ?? null };
  });
}
