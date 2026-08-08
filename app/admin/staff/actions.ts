'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { audit, type PayFrequency, type PayMode } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { getPortalSession } from '@/lib/auth';
import {
  addCertification,
  addStaffEmail,
  archiveStaff,
  assignStaffToProgram,
  createStaff,
  deleteCertification,
  markPayDatePaid,
  recordAbsence,
  removeAssignment,
  removeStaffPhoto,
  replaceForRemainder,
  setCapability,
  updateAssignmentRate,
  updateStaffDetails,
  uploadStaffPhoto,
} from '@/lib/staff/staff';

async function requireStaff() {
  const session = await getPortalSession();
  if (!session.isStaff) throw new Error('Staff only.');
  return session;
}
const cents = (v: FormDataEntryValue | null) => Math.round(Number(String(v ?? '0')) * 100) || 0;

export async function createStaffAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const s = await createStaff({ firstName: String(formData.get('firstName') ?? ''), lastName: String(formData.get('lastName') ?? ''), email: String(formData.get('email') ?? '').trim() || null, phone: String(formData.get('phone') ?? '').trim() || null, bio: String(formData.get('bio') ?? '').trim() || null }, session.userId!);
  redirect(`/staff/${s.id}`);
}

export async function updateDetailsAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('staffId'));
  await updateStaffDetails(id, { firstName: String(formData.get('firstName') ?? ''), lastName: String(formData.get('lastName') ?? ''), phone: String(formData.get('phone') ?? ''), bio: String(formData.get('bio') ?? '') }, session.userId!);
  revalidatePath(`/staff/${id}`);
}

/** Inline contact edit from the staff list's quick-expand row. */
export async function updateContactAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('staffId'));
  await updateStaffDetails(id, { email: String(formData.get('email') ?? ''), phone: String(formData.get('phone') ?? '') }, session.userId!);
  revalidatePath('/staff');
}

export async function photoAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('staffId'));
  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0) throw new Error('Choose a photo first.');
  await uploadStaffPhoto(id, await file.arrayBuffer(), file.type, session.userId!);
  revalidatePath(`/staff/${id}`);
}

export async function removePhotoAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('staffId'));
  await removeStaffPhoto(id, session.userId!);
  revalidatePath(`/staff/${id}`);
}

export async function addEmailAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('staffId'));
  await addStaffEmail(id, String(formData.get('email') ?? ''), session.userId!);
  revalidatePath(`/staff/${id}`);
}

export async function archiveStaffAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('staffId'));
  await archiveStaff(id, session.userId!, formData.get('unarchive') !== 'on');
  revalidatePath(`/staff/${id}`);
}

export async function setCapabilityAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  await setCapability(Number(formData.get('roleId')), String(formData.get('capability')), formData.get('view') === 'on', formData.get('edit') === 'on', session.userId!);
  revalidatePath('/staff/permissions');
}

/** Extensible matrix: a new capability key appears for every role once seeded on one. */
export async function addCapabilityAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const key = String(formData.get('key') ?? '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (!key) throw new Error('Capability key required.');
  const roleId = Number(formData.get('roleId'));
  if (!roleId) throw new Error('Pick the first role to grant it on.');
  await setCapability(roleId, key, true, false, session.userId!);
  revalidatePath('/staff/permissions');
}

export async function assignAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const staffId = Number(formData.get('staffId'));
  await assignStaffToProgram({
    staffId,
    programId: Number(formData.get('programId')),
    roleLabel: String(formData.get('roleLabel') ?? '').trim() || null,
    payMode: String(formData.get('payMode') ?? 'per_session') as PayMode,
    rateCents: cents(formData.get('rate')),
    frequency: String(formData.get('frequency') ?? 'after_program') as PayFrequency,
    units: formData.get('units') ? Number(formData.get('units')) : undefined,
    showPublic: formData.get('showPublic') === 'on',
    programStartISO: String(formData.get('startDate') ?? '') || null,
    programEndISO: String(formData.get('endDate') ?? '') || null,
  }, session.userId!);
  revalidatePath(`/staff/${staffId}`);
}

export async function addCertAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('staffId'));
  await addCertification({ staffId: id, name: String(formData.get('name') ?? ''), obtainedOn: String(formData.get('obtainedOn') ?? '') || null, expiresOn: String(formData.get('expiresOn') ?? '') || null }, session.userId!);
  revalidatePath(`/staff/${id}`);
}

export async function deleteCertAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const staffId = Number(formData.get('staffId'));
  await deleteCertification(Number(formData.get('certId')), session.userId!);
  revalidatePath(`/staff/${staffId}`);
}

export async function absenceAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const staffId = Number(formData.get('staffId'));
  const sessionDate = String(formData.get('sessionDate') ?? '');
  if (!sessionDate) throw new Error('Pick the absent session date.');
  await recordAbsence({
    assignmentId: Number(formData.get('assignmentId')),
    sessionDateISO: sessionDate,
    replacementStaffId: formData.get('replacementStaffId') ? Number(formData.get('replacementStaffId')) : null,
    replacementName: String(formData.get('replacementName') ?? '').trim() || null,
    replacementRateCents: formData.get('replacementRate') ? cents(formData.get('replacementRate')) : null,
  }, session.userId!);
  revalidatePath(`/staff/${staffId}`);
}

export async function replaceRemainderAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const staffId = Number(formData.get('staffId'));
  const fromDate = String(formData.get('fromDate') ?? '');
  if (!fromDate) throw new Error('Pick the handoff date.');
  await replaceForRemainder({
    assignmentId: Number(formData.get('assignmentId')),
    fromDateISO: fromDate,
    replacementStaffId: formData.get('replacementStaffId') ? Number(formData.get('replacementStaffId')) : null,
    replacementName: String(formData.get('replacementName') ?? '').trim() || null,
    newRateCents: cents(formData.get('newRate')),
  }, session.userId!);
  revalidatePath(`/staff/${staffId}`);
}

export async function updateRateAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const staffId = Number(formData.get('staffId'));
  await updateAssignmentRate({
    assignmentId: Number(formData.get('assignmentId')),
    newRateCents: cents(formData.get('newRate')),
    fromDateISO: String(formData.get('fromDate') ?? '') || null,
  }, session.userId!);
  revalidatePath(`/staff/${staffId}`);
}

export async function removeAssignmentAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const staffId = Number(formData.get('staffId'));
  await removeAssignment(Number(formData.get('assignmentId')), session.userId!);
  revalidatePath(`/staff/${staffId}`);
}

export async function markPayPaidAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  await markPayDatePaid(Number(formData.get('payDateId')), session.userId!);
  revalidatePath('/staff/pay');
}

// --- Roles on the staff record (reuses Module 1 role_assignments) -------------

export async function grantRoleAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const staffId = Number(formData.get('staffId'));
  const profileId = Number(formData.get('profileId'));
  const roleId = Number(formData.get('roleId'));
  if (!profileId || !roleId) throw new Error('Role and linked account required.');
  const { error } = await supabaseAdmin().from('role_assignments').insert({ profile_id: profileId, role_id: roleId, granted_by: session.userId });
  if (error && !error.message.includes('duplicate')) throw new Error(error.message);
  await audit({ actorId: session.userId!, action: 'role.granted', target: `profile:${profileId}`, meta: { role_id: roleId, via: `staff:${staffId}` } });
  revalidatePath(`/staff/${staffId}`);
}

export async function revokeRoleAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const staffId = Number(formData.get('staffId'));
  const assignmentId = Number(formData.get('assignmentId'));
  const { error } = await supabaseAdmin().from('role_assignments').delete().eq('id', assignmentId);
  if (error) throw new Error(error.message);
  await audit({ actorId: session.userId!, action: 'role.revoked', target: `role_assignment:${assignmentId}`, meta: { via: `staff:${staffId}` } });
  revalidatePath(`/staff/${staffId}`);
}
