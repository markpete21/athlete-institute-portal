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
}

export interface Family {
  id: number;
  name: string;
  hoh_profile_id: number | null;
  play_points_balance: number;
  members: FamilyMember[];
}

const MEMBER_COLS = 'id, family_id, profile_id, first_name, last_name, dob, email, member_role';

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

  const { data: members, error: e2 } = await db
    .from('family_members')
    .select(MEMBER_COLS)
    .eq('family_id', familyId)
    .order('id');
  if (e2) throw new Error(`members read failed: ${e2.message}`);

  // 18+ auto-conversion (dependent → adult), persisted when it fires.
  const today = torontoToday();
  const out: FamilyMember[] = [];
  for (const m of (members ?? []) as FamilyMember[]) {
    const next = memberRoleAfterBirthdays(m.member_role, m.dob, today);
    if (next !== m.member_role) {
      const { error: e3 } = await db.from('family_members').update({ member_role: next }).eq('id', m.id);
      if (!e3) {
        await audit({
          actorId: 'system:age-conversion',
          action: 'family_member.adult-converted',
          target: `family_member:${m.id}`,
          meta: { family_id: familyId, dob: m.dob },
        });
        out.push({ ...m, member_role: next });
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

/** Remove a non-HoH member (HoH-only action; callers enforce). */
export async function removeFamilyMember(memberId: number, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: m, error } = await db
    .from('family_members')
    .select('id, member_role, family_id')
    .eq('id', memberId)
    .single();
  if (error) throw new Error(`member read failed: ${error.message}`);
  if (m.member_role === 'hoh') throw new Error('The Head of Household cannot be removed.');
  const { error: e2 } = await db.from('family_members').delete().eq('id', memberId);
  if (e2) throw new Error(`member remove failed: ${e2.message}`);
  await audit({
    actorId: actorClerkId,
    action: 'family_member.removed',
    target: `family_member:${memberId}`,
    meta: { family_id: m.family_id },
  });
}

/** The signed-in profile's member row within their family (null if none). */
export function memberRowFor(family: Family, profileId: number | null): FamilyMember | null {
  if (!profileId) return null;
  return family.members.find((m) => m.profile_id === profileId) ?? null;
}
