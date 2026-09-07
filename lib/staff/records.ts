import 'server-only';
import {
  audit,
  deriveStaffStatus,
  torontoToday,
} from '@ai/foundation';
import { deleteFile, getPublicUrl, uploadFile } from '@ai/foundation/storage';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Staff records (Module 5): the staff row itself — create, contact emails,
 * details, photo, archive, and the derived active/inactive status.
 */

export type StaffEmployment = 'employee' | 'contractor' | 'volunteer';

export interface Staff {
  id: number;
  profile_id: number | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  bio: string | null;
  photo_url: string | null;
  status: 'active' | 'inactive' | 'archived';
  /** employee = Wagepoint payroll, contractor = invoices/QB bills, volunteer = no pay. */
  employment: StaffEmployment | null;
}

export const S_COLS = 'id, profile_id, first_name, last_name, email, phone, bio, photo_url, status, employment';

export async function createStaff(input: { firstName: string; lastName: string; email?: string | null; phone?: string | null; bio?: string | null; photoUrl?: string | null; profileId?: number | null; employment?: StaffEmployment | null }, actorClerkId: string): Promise<Staff> {
  const { data, error } = await supabaseAdmin()
    .from('staff')
    .insert({ first_name: input.firstName.trim(), last_name: input.lastName.trim(), email: input.email ?? null, phone: input.phone?.trim() || null, bio: input.bio ?? null, photo_url: input.photoUrl ?? null, profile_id: input.profileId ?? null, employment: input.employment ?? null, created_by: actorClerkId })
    .select(S_COLS)
    .single();
  if (error) throw new Error(`staff create failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'staff.created', target: `staff:${data.id}`, meta: { name: `${input.firstName} ${input.lastName}`, accountLess: !input.profileId } });
  return data as Staff;
}

/**
 * Upgrade an account-less coach: attach an email for a later Clerk invite.
 * If a portal profile already exists for that email, link it immediately -
 * the coach's existing login becomes their staff login with no invite needed.
 */
export async function addStaffEmail(staffId: number, email: string, actorClerkId: string): Promise<{ linkedProfileId: number | null }> {
  const db = supabaseAdmin();
  const normalized = email.trim().toLowerCase();
  const { data: existing } = await db.from('profiles').select('id').eq('email', normalized).maybeSingle();
  const { error } = await db.from('staff').update({ email: normalized, ...(existing ? { profile_id: existing.id } : {}) }).eq('id', staffId);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'staff.email-added', target: `staff:${staffId}`, meta: { email: normalized, linkedProfileId: existing?.id ?? null } });
  // (Without an existing profile, a Clerk invite is sent by ops/onboarding;
  // recorded here as the upgrade intent. getOrCreateProfile links by verified
  // email on their first sign-in.)
  return { linkedProfileId: existing?.id ?? null };
}

export async function updateStaffDetails(staffId: number, input: { firstName?: string; lastName?: string; email?: string | null; phone?: string | null; bio?: string | null; employment?: StaffEmployment | null }, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const patch: Record<string, unknown> = {};
  if (input.firstName !== undefined) patch.first_name = input.firstName.trim();
  if (input.lastName !== undefined) patch.last_name = input.lastName.trim();
  if (input.phone !== undefined) patch.phone = input.phone?.trim() || null;
  if (input.bio !== undefined) patch.bio = input.bio?.trim() || null;
  if (input.employment !== undefined) patch.employment = input.employment;
  if (input.email !== undefined) {
    const email = input.email?.trim().toLowerCase() || null;
    patch.email = email;
    // A not-yet-linked record adopts an existing profile on email change,
    // same as addStaffEmail. An existing profile link is never touched here.
    if (email) {
      const { data: staffRow } = await db.from('staff').select('profile_id').eq('id', staffId).single();
      if (staffRow && !staffRow.profile_id) {
        const { data: existing } = await db.from('profiles').select('id').eq('email', email).maybeSingle();
        if (existing) patch.profile_id = existing.id;
      }
    }
  }
  if (!Object.keys(patch).length) return;
  const { error } = await db.from('staff').update(patch).eq('id', staffId);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'staff.updated', target: `staff:${staffId}`, meta: patch });
}

const PHOTO_EXTS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Upload/replace a staff photo (public bucket - these render on public pages). */
export async function uploadStaffPhoto(staffId: number, bytes: ArrayBuffer, contentType: string, actorClerkId: string): Promise<string> {
  const ext = PHOTO_EXTS[contentType];
  if (!ext) throw new Error('Photo must be JPEG, PNG, or WebP.');
  if (bytes.byteLength > 5 * 1024 * 1024) throw new Error('Photo must be under 5MB.');
  const path = `staff/${staffId}.${ext}`;
  await uploadFile('staff-photos', path, bytes, { contentType, upsert: true });
  // Same path per extension; clean up a stale copy under a different extension.
  const others = Object.values(PHOTO_EXTS).filter((e) => e !== ext).map((e) => `staff/${staffId}.${e}`);
  await deleteFile('staff-photos', others).catch(() => undefined);
  const url = `${getPublicUrl('staff-photos', path)}?v=${Date.now()}`;
  const { error } = await supabaseAdmin().from('staff').update({ photo_url: url }).eq('id', staffId);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'staff.photo-set', target: `staff:${staffId}` });
  return url;
}

export async function removeStaffPhoto(staffId: number, actorClerkId: string): Promise<void> {
  const paths = Object.values(PHOTO_EXTS).map((e) => `staff/${staffId}.${e}`);
  await deleteFile('staff-photos', paths).catch(() => undefined);
  const { error } = await supabaseAdmin().from('staff').update({ photo_url: null }).eq('id', staffId);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'staff.photo-removed', target: `staff:${staffId}` });
}

export async function archiveStaff(staffId: number, actorClerkId: string, archived = true): Promise<void> {
  const { error } = await supabaseAdmin().from('staff').update({ status: archived ? 'archived' : 'inactive', archived_at: archived ? new Date().toISOString() : null }).eq('id', staffId);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: archived ? 'staff.archived' : 'staff.unarchived', target: `staff:${staffId}` });
}

/** Recompute active/inactive from assignments + outstanding pay (archive sticks). */
export async function refreshStaffStatus(staffId: number): Promise<Staff['status']> {
  const db = supabaseAdmin();
  const { data: staff } = await db.from('staff').select('status, archived_at').eq('id', staffId).single();
  if (staff!.archived_at) return 'archived';
  const today = torontoToday();

  const { data: assigns } = await db.from('staff_assignments').select('id, program_id, active').eq('staff_id', staffId);
  let hasCurrent = false;
  for (const a of assigns ?? []) {
    if (!a.active) continue; // replaced-for-remainder assignments don't count as current work
    const { data: sess } = await db.from('program_sessions').select('ends_at').eq('program_id', a.program_id).order('ends_at', { ascending: false }).limit(1).maybeSingle();
    if (!sess || sess.ends_at.slice(0, 10) >= today) { hasCurrent = true; break; } // upcoming/ongoing (or no sessions yet)
  }

  // Outstanding pay counts across ALL assignments, incl. closed ones - a
  // replaced coach stays active until they're paid for the portion worked.
  const assignIds = (assigns ?? []).map((a) => a.id);
  let hasOutstanding = false;
  if (assignIds.length) {
    const { count } = await db.from('staff_pay_dates').select('id', { count: 'exact', head: true }).in('assignment_id', assignIds).eq('status', 'outstanding');
    hasOutstanding = (count ?? 0) > 0;
  }

  const next = deriveStaffStatus({ archived: false, hasCurrentOrUpcomingAssignment: hasCurrent, hasOutstandingPay: hasOutstanding });
  await db.from('staff').update({ status: next }).eq('id', staffId);
  return next;
}
