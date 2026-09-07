'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { audit, type PayFrequency, type PayMode } from '@ai/foundation';
import type { StaffEmployment } from '@/lib/staff/staff';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { MANAGE_ROLES } from '@/lib/access/capabilities';
import { addCapabilityKey, grantRole, revokeRoleAssignment, setRoleCapability } from '@/lib/access/roles';
import { requireStaff, requireStaffCapability } from '@/lib/auth';
import { bool, id, idOrNull, str, strOrThrow } from '@/lib/forms';
import {
  addCertification,
  addStaffEmail,
  archiveStaff,
  assignStaffToProgram,
  createCertType,
  createStaff,
  deleteCertification,
  markPayDatePaid,
  recordAbsence,
  removeAssignment,
  removeStaffPhoto,
  replaceForRemainder,
  setCapability,
  setProgramRoleCert,
  updateAssignmentRate,
  updateCertType,
  updateStaffDetails,
  uploadStaffPhoto,
} from '@/lib/staff/staff';

const cents = (v: FormDataEntryValue | null) => Math.round(Number(String(v ?? '0')) * 100) || 0;

export async function createStaffAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const employment = String(formData.get('employment') ?? '');
  const s = await createStaff({
    firstName: String(formData.get('firstName') ?? ''),
    lastName: String(formData.get('lastName') ?? ''),
    email: String(formData.get('email') ?? '').trim() || null,
    phone: String(formData.get('phone') ?? '').trim() || null,
    bio: String(formData.get('bio') ?? '').trim() || null,
    employment: ['employee', 'contractor', 'volunteer'].includes(employment) ? (employment as StaffEmployment) : null,
  }, session.userId);
  redirect(`/staff/${s.id}`);
}

export async function updateDetailsAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('staffId'));
  const employment = String(formData.get('employment') ?? '');
  await updateStaffDetails(id, {
    firstName: String(formData.get('firstName') ?? ''),
    lastName: String(formData.get('lastName') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    bio: String(formData.get('bio') ?? ''),
    employment: ['employee', 'contractor', 'volunteer'].includes(employment) ? (employment as StaffEmployment) : null,
  }, session.userId);
  revalidatePath(`/staff/${id}`);
}

/** Inline contact edit from the staff list's quick-expand row. */
export async function updateContactAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('staffId'));
  await updateStaffDetails(id, { email: String(formData.get('email') ?? ''), phone: String(formData.get('phone') ?? '') }, session.userId);
  revalidatePath('/staff');
}

export async function photoAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('staffId'));
  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0) throw new Error('Choose a photo first.');
  await uploadStaffPhoto(id, await file.arrayBuffer(), file.type, session.userId);
  revalidatePath(`/staff/${id}`);
}

export async function removePhotoAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('staffId'));
  await removeStaffPhoto(id, session.userId);
  revalidatePath(`/staff/${id}`);
}

export async function addEmailAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('staffId'));
  await addStaffEmail(id, String(formData.get('email') ?? ''), session.userId);
  revalidatePath(`/staff/${id}`);
}

export async function archiveStaffAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('staffId'));
  await archiveStaff(id, session.userId, formData.get('unarchive') !== 'on');
  revalidatePath(`/staff/${id}`);
}

// The matrix and role grants are security-root operations (manage_roles);
// lib/access/roles enforces no-self-grant / last-root-holder / root-not-editable.
const requireRoleAdmin = () => requireStaffCapability(MANAGE_ROLES, 'edit', 'Only an administrator with the manage-roles permission can change permissions.');

export async function setCapabilityAction(formData: FormData): Promise<void> {
  const session = await requireRoleAdmin();
  await setRoleCapability(session, id(formData.get('roleId'), 'role'), strOrThrow(formData.get('capability'), 'Capability'), bool(formData.get('view')), bool(formData.get('edit')));
  revalidatePath('/staff/permissions');
}

/** Extensible matrix: a new capability key appears for every role once seeded on one. */
export async function addCapabilityAction(formData: FormData): Promise<void> {
  const session = await requireRoleAdmin();
  const roleId = idOrNull(formData.get('roleId'));
  if (!roleId) throw new Error('Pick the first role to grant it on.');
  await addCapabilityKey(session, str(formData.get('key')), roleId);
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
  }, session.userId);
  revalidatePath(`/staff/${staffId}`);
}

export async function addCertAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('staffId'));
  await addCertification({
    staffId: id,
    certTypeId: Number(formData.get('certTypeId')) || null,
    name: String(formData.get('name') ?? '').trim() || null,
    obtainedOn: String(formData.get('obtainedOn') ?? '') || null,
    expiresOn: String(formData.get('expiresOn') ?? '') || null,
  }, session.userId);
  revalidatePath(`/staff/${id}`);
}

// --- Certification catalog (/staff/certifications) -----------------------------

export async function createCertTypeAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  await createCertType({
    name: String(formData.get('name') ?? ''),
    description: String(formData.get('description') ?? '').trim() || null,
    validityMonths: Number(formData.get('validityMonths')) || null,
  }, session.userId);
  revalidatePath('/staff/certifications');
}

export async function updateCertTypeAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  await updateCertType(Number(formData.get('certTypeId')), {
    description: String(formData.get('description') ?? '').trim() || null,
    validityMonths: Number(formData.get('validityMonths')) || null,
  }, session.userId);
  revalidatePath('/staff/certifications');
}

export async function toggleCertTypeAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  await updateCertType(Number(formData.get('certTypeId')), { active: formData.get('active') === 'on' }, session.userId);
  revalidatePath('/staff/certifications');
}

/** Toggle one required cert for a role on a program (program builder). */
export async function setProgramRoleCertAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const programId = Number(formData.get('programId'));
  await setProgramRoleCert(
    programId,
    String(formData.get('roleLabel') ?? ''),
    Number(formData.get('certTypeId')),
    formData.get('required') === 'on',
    session.userId,
  );
  revalidatePath(`/programs/${programId}`);
}

export async function deleteCertAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const staffId = Number(formData.get('staffId'));
  await deleteCertification(Number(formData.get('certId')), session.userId);
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
  }, session.userId);
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
  }, session.userId);
  revalidatePath(`/staff/${staffId}`);
}

export async function updateRateAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const staffId = Number(formData.get('staffId'));
  await updateAssignmentRate({
    assignmentId: Number(formData.get('assignmentId')),
    newRateCents: cents(formData.get('newRate')),
    fromDateISO: String(formData.get('fromDate') ?? '') || null,
  }, session.userId);
  revalidatePath(`/staff/${staffId}`);
}

export async function removeAssignmentAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const staffId = Number(formData.get('staffId'));
  await removeAssignment(Number(formData.get('assignmentId')), session.userId);
  revalidatePath(`/staff/${staffId}`);
}

export async function markPayPaidAction(formData: FormData): Promise<void> {
  const session = await requireStaffCapability('pay', 'edit');
  await markPayDatePaid(id(formData.get('payDateId'), 'pay date'), session.userId);
  revalidatePath('/staff/pay');
}

// --- Roles on the staff record (reuses Module 1 role_assignments) -------------

export async function grantRoleAction(formData: FormData): Promise<void> {
  const session = await requireRoleAdmin();
  const staffId = id(formData.get('staffId'), 'staff');
  const profileId = idOrNull(formData.get('profileId'));
  const roleId = idOrNull(formData.get('roleId'));
  if (!profileId || !roleId) throw new Error('Role and linked account required.');
  await grantRole(session, profileId, roleId, `staff:${staffId}`);
  revalidatePath(`/staff/${staffId}`);
}

export async function revokeRoleAction(formData: FormData): Promise<void> {
  const session = await requireRoleAdmin();
  const staffId = id(formData.get('staffId'), 'staff');
  await revokeRoleAssignment(session, id(formData.get('assignmentId'), 'assignment'), `staff:${staffId}`);
  revalidatePath(`/staff/${staffId}`);
}
