import 'server-only';
import {
  audit,
  memberRoleAfterBirthdays,
  torontoToday,
  type FamilyMemberRole,
} from '@ai/foundation';
import { notify } from '@ai/foundation/notify';
import { supabaseAdmin } from '@ai/foundation/supabase';
import type { Profile } from '@/lib/profile';

/**
 * Household flows (Module 1 Stage 3). All writes assume the CALLER has already
 * enforced the family policy (canManageFamily etc. from @ai/foundation) —
 * server actions do that with the session's member role.
 */

export interface FamilyMember {
  id: number;
  family_id: number;
  profile_id: number | null;
  first_name: string;
  last_name: string;
  dob: string | null;
  email: string | null;
  member_role: FamilyMemberRole;
  /** Dual-household (divorced parents): a dependent may also belong to a second family. */
  second_family_id: number | null;
  photo_path: string | null;
}

export interface Family {
  id: number;
  name: string;
  hoh_profile_id: number | null;
  play_points_balance: number;
  members: FamilyMember[];
}

const MEMBER_COLS = 'id, family_id, profile_id, first_name, last_name, dob, email, member_role, second_family_id, photo_path';

/**
 * A customer's household, created on first touch: signing in with no family
 * makes them HoH of a new one (spec: every customer belongs to a family).
 */
export async function getOrCreateFamily(profile: Profile): Promise<Family> {
  const db = supabaseAdmin();

  let familyId = profile.family_id;
  if (!familyId) {
    const label = [profile.last_name, 'Household'].filter(Boolean).join(' ') || 'Household';
    const { data: fam, error } = await db
      .from('families')
      .insert({ name: label, hoh_profile_id: profile.id })
      .select('id')
      .single();
    if (error) throw new Error(`family create failed: ${error.message}`);
    familyId = fam.id as number;

    const { error: e2 } = await db.from('profiles').update({ family_id: familyId }).eq('id', profile.id);
    if (e2) throw new Error(`family link failed: ${e2.message}`);
    const { error: e3 } = await db.from('family_members').insert({
      family_id: familyId,
      profile_id: profile.id,
      first_name: profile.first_name ?? 'Head',
      last_name: profile.last_name ?? 'of Household',
      email: profile.email,
      member_role: 'hoh',
    });
    if (e3) throw new Error(`hoh member failed: ${e3.message}`);
    await audit({
      actorId: profile.clerk_user_id,
      action: 'family.created',
      target: `family:${familyId}`,
    });
  }

  return loadFamily(familyId);
}

/** Load a family incl. members, applying the 18+ auto-conversion lazily. */
export async function loadFamily(familyId: number): Promise<Family> {
  const db = supabaseAdmin();
  const { data: fam, error } = await db
    .from('families')
    .select('id, name, hoh_profile_id, play_points_balance')
    .eq('id', familyId)
    .single();
  if (error) throw new Error(`family read failed: ${error.message}`);

  // Both the members this family owns AND dependents shared into it from
  // another household (dual-household children read as full members here).
  const { data: members, error: e2 } = await db
    .from('family_members')
    .select(MEMBER_COLS)
    .or(`family_id.eq.${familyId},second_family_id.eq.${familyId}`)
    .order('id');
  if (e2) throw new Error(`members read failed: ${e2.message}`);

  // 18+ auto-conversion (dependent → adult), persisted when it fires. Adults
  // are single-household, so the conversion also dissolves any dual-household
  // link — the now-adult member stays in their primary family only.
  const today = torontoToday();
  const out: FamilyMember[] = [];
  for (const m of (members ?? []) as FamilyMember[]) {
    const next = memberRoleAfterBirthdays(m.member_role, m.dob, today);
    if (next !== m.member_role) {
      const { error: e3 } = await db
        .from('family_members')
        .update({ member_role: next, second_family_id: null })
        .eq('id', m.id);
      if (!e3) {
        await audit({
          actorId: 'system:age-conversion',
          action: 'family_member.adult-converted',
          target: `family_member:${m.id}`,
          meta: { family_id: familyId, dob: m.dob, was_shared: m.second_family_id != null },
        });
        out.push({ ...m, member_role: next, second_family_id: null });
        continue;
      }
    }
    out.push(m);
  }

  return { ...(fam as Omit<Family, 'members'>), members: out };
}

export interface AddMemberInput {
  familyId: number;
  firstName: string;
  lastName: string;
  dob?: string | null;
  email?: string | null;
  memberRole: Exclude<FamilyMemberRole, 'hoh'>; // one HoH, enforced by the DB
  actorClerkId: string;
}

/**
 * HoH adds a member. Adding with an email sends the notification the spec
 * requires (email channel; notify() no-ops gracefully if Resend isn't wired).
 */
export async function addFamilyMember(input: AddMemberInput): Promise<FamilyMember> {
  const { data, error } = await supabaseAdmin()
    .from('family_members')
    .insert({
      family_id: input.familyId,
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      dob: input.dob || null,
      email: input.email?.trim() || null,
      member_role: input.memberRole,
    })
    .select(MEMBER_COLS)
    .single();
  if (error) throw new Error(`member add failed: ${error.message}`);

  await audit({
    actorId: input.actorClerkId,
    action: 'family_member.added',
    target: `family_member:${data.id}`,
    meta: { family_id: input.familyId, member_role: input.memberRole },
  });

  if (data.email) {
    await notify({
      to: { email: data.email },
      channels: ['email'],
      template: 'generic',
      data: {
        heading: "You've been added to a household",
        body: `${input.firstName}, you've been added to a family account on the Athlete Institute portal. You can view schedules and registrations once you sign in with this email address.`,
        ctaLabel: 'Open the portal',
        ctaUrl: process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca',
      },
    });
  }

  return data as FamilyMember;
}

/**
 * Remove a non-HoH member (HoH-only action; callers enforce). Dual-household
 * aware when actorFamilyId is passed:
 *  - removing from the SECOND household unlinks (the child stays in their
 *    primary family, untouched);
 *  - removing a still-shared child from the PRIMARY household promotes the
 *    second household to primary (the other parent keeps the child) rather
 *    than deleting them out of both rosters at once.
 */
export async function removeFamilyMember(
  memberId: number,
  actorClerkId: string,
  actorFamilyId?: number,
): Promise<void> {
  const db = supabaseAdmin();
  const { data: m, error } = await db
    .from('family_members')
    .select('id, member_role, family_id, second_family_id')
    .eq('id', memberId)
    .single();
  if (error) throw new Error(`member read failed: ${error.message}`);
  if (m.member_role === 'hoh') throw new Error('The Head of Household cannot be removed.');

  if (actorFamilyId && m.second_family_id === actorFamilyId) {
    const { error: e2 } = await db.from('family_members').update({ second_family_id: null }).eq('id', memberId);
    if (e2) throw new Error(`member unlink failed: ${e2.message}`);
    await audit({
      actorId: actorClerkId,
      action: 'family_member.unshared',
      target: `family_member:${memberId}`,
      meta: { family_id: actorFamilyId, primary_family_id: m.family_id, by: 'second-household' },
    });
    return;
  }

  if (m.second_family_id && (!actorFamilyId || actorFamilyId === m.family_id)) {
    const { error: e2 } = await db
      .from('family_members')
      .update({ family_id: m.second_family_id, second_family_id: null })
      .eq('id', memberId);
    if (e2) throw new Error(`member promote failed: ${e2.message}`);
    await audit({
      actorId: actorClerkId,
      action: 'family_member.promoted-to-second-household',
      target: `family_member:${memberId}`,
      meta: { from_family_id: m.family_id, to_family_id: m.second_family_id },
    });
    return;
  }

  const { error: e2 } = await db.from('family_members').delete().eq('id', memberId);
  if (e2) throw new Error(`member remove failed: ${e2.message}`);
  await audit({
    actorId: actorClerkId,
    action: 'family_member.removed',
    target: `family_member:${memberId}`,
    meta: { family_id: m.family_id },
  });
}

export interface UpdateMemberInput {
  memberId: number;
  firstName?: string;
  lastName?: string;
  dob?: string | null;
  email?: string | null;
  actorClerkId: string;
}

/** Edit a member's details (HoH-only action; callers enforce). Audited. */
export async function updateFamilyMember(input: UpdateMemberInput): Promise<FamilyMember> {
  const patch: Record<string, unknown> = {};
  if (input.firstName !== undefined) patch.first_name = input.firstName.trim();
  if (input.lastName !== undefined) patch.last_name = input.lastName.trim();
  if (input.dob !== undefined) patch.dob = input.dob || null;
  if (input.email !== undefined) patch.email = input.email?.trim() || null;
  if (Object.keys(patch).length === 0) throw new Error('Nothing to update.');

  const { data, error } = await supabaseAdmin()
    .from('family_members')
    .update(patch)
    .eq('id', input.memberId)
    .select(MEMBER_COLS)
    .single();
  if (error) throw new Error(`member update failed: ${error.message}`);
  await audit({
    actorId: input.actorClerkId,
    action: 'family_member.updated',
    target: `family_member:${input.memberId}`,
    meta: { fields: Object.keys(patch), family_id: data.family_id },
  });
  return data as FamilyMember;
}

/**
 * Dual-household share: link a dependent into a second household (divorced /
 * separated parents). The target is identified by the OTHER parent's account
 * email — they must have signed in at least once (so a household exists to
 * link to). Only dependents can be shared; the child stays owned by the
 * primary family and appears on both rosters.
 */
export async function shareDependent(input: {
  memberId: number;
  actorFamilyId: number;
  targetEmail: string;
  actorClerkId: string;
}): Promise<{ targetFamilyId: number }> {
  const db = supabaseAdmin();
  const { data: m, error } = await db
    .from('family_members')
    .select('id, member_role, family_id, second_family_id, first_name')
    .eq('id', input.memberId)
    .single();
  if (error) throw new Error(`member read failed: ${error.message}`);
  if (m.family_id !== input.actorFamilyId) throw new Error('Only the primary household can share a member.');
  if (m.member_role !== 'dependent') throw new Error('Only dependents (under 18) can be in two households.');
  if (m.second_family_id) throw new Error('This member is already shared with a second household.');

  const email = input.targetEmail.trim().toLowerCase();
  const { data: target } = await db
    .from('profiles')
    .select('id, family_id, email')
    .ilike('email', email)
    .maybeSingle();
  if (!target?.family_id) {
    throw new Error('No account with a household was found for that email. They need to sign in to the portal once first.');
  }
  if (target.family_id === m.family_id) throw new Error('That account is already in this household.');

  const { error: e2 } = await db
    .from('family_members')
    .update({ second_family_id: target.family_id })
    .eq('id', input.memberId);
  if (e2) throw new Error(`share failed: ${e2.message}`);

  await audit({
    actorId: input.actorClerkId,
    action: 'family_member.shared',
    target: `family_member:${input.memberId}`,
    meta: { family_id: m.family_id, second_family_id: target.family_id, target_email: email },
  });

  await notify({
    to: { email: target.email! },
    channels: ['email'],
    template: 'generic',
    data: {
      heading: `${m.first_name} was added to your household`,
      body: `${m.first_name} now appears in your Athlete Institute household as well. You can see their schedule and register them for programs — payments you make stay on your account.`,
      ctaLabel: 'View your household',
      ctaUrl: `${process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca'}/account`,
    },
  });

  return { targetFamilyId: target.family_id };
}

/** Revoke a dual-household link (either household's HoH; callers enforce membership). */
export async function unshareDependent(memberId: number, actorFamilyId: number, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: m, error } = await db
    .from('family_members')
    .select('id, family_id, second_family_id')
    .eq('id', memberId)
    .single();
  if (error) throw new Error(`member read failed: ${error.message}`);
  if (!m.second_family_id) return; // nothing to do
  if (m.family_id !== actorFamilyId && m.second_family_id !== actorFamilyId) {
    throw new Error('That member is not in your household.');
  }
  const { error: e2 } = await db.from('family_members').update({ second_family_id: null }).eq('id', memberId);
  if (e2) throw new Error(`unshare failed: ${e2.message}`);
  await audit({
    actorId: actorClerkId,
    action: 'family_member.unshared',
    target: `family_member:${memberId}`,
    meta: { family_id: actorFamilyId, primary_family_id: m.family_id },
  });
}

/** The signed-in profile's member row within their family (null if none). */
export function memberRowFor(family: Family, profileId: number | null): FamilyMember | null {
  if (!profileId) return null;
  return family.members.find((m) => m.profile_id === profileId) ?? null;
}
