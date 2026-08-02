'use server';

import { revalidatePath } from 'next/cache';
import { audit, canManageFamily } from '@ai/foundation';
import { BUCKETS, deleteFile, uploadFile } from '@ai/foundation/storage';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { getPortalSession } from '@/lib/auth';
import {
  addFamilyMember,
  getOrCreateFamily,
  memberRowFor,
  removeFamilyMember,
  shareDependent,
  unshareDependent,
  updateFamilyMember,
} from '@/lib/family';
import { getOrCreateProfile } from '@/lib/profile';

/** HoH-only guard shared by the mutations below. */
async function requireHoh() {
  const session = await getPortalSession();
  if (!session.userId) throw new Error('Sign in first.');
  const profile = await getOrCreateProfile();
  const family = await getOrCreateFamily(profile);
  const me = memberRowFor(family, profile.id);
  if (!me || !canManageFamily(me.member_role)) {
    throw new Error('Only the Head of Household can manage family members.');
  }
  return { session, family };
}

export async function addMemberAction(formData: FormData): Promise<void> {
  const { session, family } = await requireHoh();

  const firstName = String(formData.get('firstName') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();
  const dob = String(formData.get('dob') ?? '').trim() || null;
  const email = String(formData.get('email') ?? '').trim() || null;
  const memberRole = String(formData.get('memberRole') ?? 'dependent') as
    | 'secondary'
    | 'dependent'
    | 'adult';

  if (!firstName || !lastName) throw new Error('First and last name are required.');
  if (memberRole === 'dependent' && !dob) throw new Error('Dependents need a date of birth.');

  await addFamilyMember({
    familyId: family.id,
    firstName,
    lastName,
    dob,
    email,
    memberRole,
    actorClerkId: session.userId!,
  });
  revalidatePath('/account');
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const { session, family } = await requireHoh();
  const memberId = Number(formData.get('memberId'));
  if (!family.members.some((m) => m.id === memberId)) {
    throw new Error('That member is not in your household.');
  }
  // Dual-household aware: removing a shared child from the second household
  // unlinks; from the primary while shared, the other household keeps them.
  await removeFamilyMember(memberId, session.userId!, family.id);
  revalidatePath('/account');
}

export async function updateMemberAction(formData: FormData): Promise<void> {
  const { session, family } = await requireHoh();
  const memberId = Number(formData.get('memberId'));
  if (!family.members.some((m) => m.id === memberId)) {
    throw new Error('That member is not in your household.');
  }
  const firstName = String(formData.get('firstName') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();
  if (!firstName || !lastName) throw new Error('First and last name are required.');
  await updateFamilyMember({
    memberId,
    firstName,
    lastName,
    dob: String(formData.get('dob') ?? '').trim() || null,
    email: String(formData.get('email') ?? '').trim() || null,
    actorClerkId: session.userId!,
  });
  revalidatePath('/account');
}

const PHOTO_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Upload (or replace) a member's photo — private bucket, served via signed URLs. */
export async function uploadMemberPhotoAction(formData: FormData): Promise<void> {
  const { session, family } = await requireHoh();
  const memberId = Number(formData.get('memberId'));
  const member = family.members.find((m) => m.id === memberId);
  if (!member) throw new Error('That member is not in your household.');

  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0) throw new Error('Choose a photo first.');
  const ext = PHOTO_TYPES[file.type];
  if (!ext) throw new Error('Photos must be JPEG, PNG or WebP.');
  if (file.size > PHOTO_MAX_BYTES) throw new Error('Photos must be under 5 MB.');

  const path = `family-${member.family_id}/member-${memberId}.${ext}`;
  await uploadFile(BUCKETS.memberPhotos, path, Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
    upsert: true,
  });
  // Replacing under a DIFFERENT extension leaves the old object behind — clean it.
  if (member.photo_path && member.photo_path !== path) {
    try { await deleteFile(BUCKETS.memberPhotos, [member.photo_path]); } catch { /* best-effort */ }
  }
  const { error } = await supabaseAdmin()
    .from('family_members')
    .update({ photo_path: path, photo_url: null, photo_media_id: null })
    .eq('id', memberId);
  if (error) throw new Error(`photo save failed: ${error.message}`);
  await audit({
    actorId: session.userId!,
    action: 'family_member.photo-updated',
    target: `family_member:${memberId}`,
    meta: { family_id: member.family_id },
  });
  revalidatePath('/account');
}

export async function removeMemberPhotoAction(formData: FormData): Promise<void> {
  const { session, family } = await requireHoh();
  const memberId = Number(formData.get('memberId'));
  const member = family.members.find((m) => m.id === memberId);
  if (!member) throw new Error('That member is not in your household.');
  if (member.photo_path) {
    try { await deleteFile(BUCKETS.memberPhotos, [member.photo_path]); } catch { /* best-effort */ }
  }
  const { error } = await supabaseAdmin()
    .from('family_members')
    .update({ photo_path: null, photo_url: null, photo_media_id: null })
    .eq('id', memberId);
  if (error) throw new Error(`photo remove failed: ${error.message}`);
  await audit({
    actorId: session.userId!,
    action: 'family_member.photo-removed',
    target: `family_member:${memberId}`,
    meta: { family_id: member.family_id },
  });
  revalidatePath('/account');
}

/** Share a dependent into the other parent's household (dual-household). */
export async function shareMemberAction(formData: FormData): Promise<void> {
  const { session, family } = await requireHoh();
  const memberId = Number(formData.get('memberId'));
  const targetEmail = String(formData.get('targetEmail') ?? '').trim();
  if (!targetEmail) throw new Error("Enter the other parent's account email.");
  if (!family.members.some((m) => m.id === memberId)) {
    throw new Error('That member is not in your household.');
  }
  await shareDependent({ memberId, actorFamilyId: family.id, targetEmail, actorClerkId: session.userId! });
  revalidatePath('/account');
}

export async function unshareMemberAction(formData: FormData): Promise<void> {
  const { session, family } = await requireHoh();
  const memberId = Number(formData.get('memberId'));
  if (!family.members.some((m) => m.id === memberId)) {
    throw new Error('That member is not in your household.');
  }
  await unshareDependent(memberId, family.id, session.userId!);
  revalidatePath('/account');
}
