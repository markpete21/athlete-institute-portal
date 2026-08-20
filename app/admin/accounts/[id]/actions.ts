'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { audit } from '@ai/foundation';
import { notify } from '@ai/foundation/notify';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { mergeAccounts } from '@/lib/accounts/merge';
import { getPortalSession, type PortalSession } from '@/lib/auth';
import { applyPlayPoints, ensureSeasonCredit, setCreditCapOverride } from '@/lib/credits';
import { shareDependent } from '@/lib/family';
import { profileCan } from '@/lib/staff/staff';
import { updateTypeSettings } from '@/lib/type-settings';

async function requireStaff(): Promise<PortalSession> {
  const session = await getPortalSession();
  if (!session.isStaff) throw new Error('Staff only.');
  return session;
}

const back = (profileId: number) => revalidatePath(`/accounts/${profileId}`);

/** Suspend / reactivate / archive an account. Suspended blocks NEW registrations, not paying. */
export async function setAccountStatusAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const profileId = Number(formData.get('profileId'));
  const status = String(formData.get('status'));
  if (!['active', 'suspended', 'archived'].includes(status)) throw new Error('Unknown status.');
  const { error } = await supabaseAdmin().from('profiles').update({ status }).eq('id', profileId);
  if (error) throw new Error(`status change failed: ${error.message}`);
  await audit({
    actorId: session.userId!,
    action: 'account.status-changed',
    target: `profile:${profileId}`,
    meta: { status },
  });
  back(profileId);
}

/** Per-account staff-credit cap override (empty = back to the portal default). */
export async function setStaffCreditCapAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const profileId = Number(formData.get('profileId'));
  const raw = String(formData.get('capDollars') ?? '').trim();
  const capCents = raw === '' ? null : Math.round(Number(raw) * 100);
  if (capCents !== null && (!Number.isFinite(capCents) || capCents < 0)) throw new Error('Bad cap amount.');
  await ensureSeasonCredit(profileId); // account row must exist to hold the override
  await setCreditCapOverride(profileId, capCents);
  await audit({
    actorId: session.userId!,
    action: 'staff_credit.cap-overridden',
    target: `profile:${profileId}`,
    meta: { cap_cents: capCents },
  });
  back(profileId);
}

/** Portal-wide default staff-credit cap (portal_settings). */
export async function setDefaultCreditCapAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const capCents = Math.round(Number(formData.get('capDollars')) * 100);
  if (!Number.isFinite(capCents) || capCents < 0) throw new Error('Bad cap amount.');
  const { error } = await supabaseAdmin()
    .from('portal_settings')
    .upsert({ key: 'staff_credit_default_cap_cents', value: String(capCents) }, { onConflict: 'key' });
  if (error) throw new Error(`default cap save failed: ${error.message}`);
  await audit({ actorId: session.userId!, action: 'portal_settings.updated', target: 'portal_settings:staff_credit_default_cap_cents', meta: { cap_cents: capCents } });
  revalidatePath('/accounts');
}

/** Typed per-account settings (org invoice terms, marketing opt-in, …). */
export async function updateAccountSettingsAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const profileId = Number(formData.get('profileId'));
  const userType = String(formData.get('userType'));
  if (userType === 'organization') {
    const days = Number(formData.get('invoiceTermsDays'));
    if (!Number.isInteger(days) || days < 0 || days > 365) throw new Error('Invoice terms must be 0-365 days.');
    await updateTypeSettings<'organization'>(profileId, { invoiceTermsDays: days });
  } else if (userType === 'customer') {
    await updateTypeSettings<'customer'>(profileId, { marketingOptIn: formData.get('marketingOptIn') === 'on' });
  } else if (userType === 'staff') {
    await updateTypeSettings<'staff'>(profileId, { staffDiscountsEnabled: formData.get('staffDiscountsEnabled') === 'on' });
  } else if (userType === 'tenant') {
    const areas = String(formData.get('scheduleAreas') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    await updateTypeSettings<'tenant'>(profileId, { scheduleAreas: areas });
  }
  await audit({ actorId: session.userId!, action: 'account.settings-updated', target: `profile:${profileId}`, meta: { userType } });
  back(profileId);
}

/** Front-desk credit adjustment (Credit on Account, +/- dollars, reason required). */
export async function adjustCreditAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const profileId = Number(formData.get('profileId'));
  const familyId = Number(formData.get('familyId'));
  const deltaCents = Math.round(Number(formData.get('deltaDollars')) * 100);
  const reason = String(formData.get('reason') ?? '').trim();
  if (!familyId || !Number.isFinite(deltaCents) || deltaCents === 0) throw new Error('Enter a non-zero amount.');
  if (!reason) throw new Error('A reason is required.');
  const { error } = await supabaseAdmin().rpc('credit_apply', {
    p_family_id: familyId,
    p_delta: deltaCents,
    p_reason: `staff:${reason}`,
    p_ref: `profile:${profileId}`,
    p_created_by: session.userId!,
  });
  if (error) throw new Error(`credit adjust failed: ${error.message}`);
  back(profileId);
}

/** Front-desk Play Points adjustment (+/- points, reason required). */
export async function adjustPointsAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const profileId = Number(formData.get('profileId'));
  const familyId = Number(formData.get('familyId'));
  const delta = Math.round(Number(formData.get('deltaPoints')));
  const reason = String(formData.get('reason') ?? '').trim();
  if (!familyId || !Number.isFinite(delta) || delta === 0) throw new Error('Enter a non-zero amount.');
  if (!reason) throw new Error('A reason is required.');
  await applyPlayPoints(familyId, delta, `staff:${reason}`, session.userId!, `profile:${profileId}`);
  back(profileId);
}

/** Staff-side dual-household link for a dependent. */
export async function adminShareDependentAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const profileId = Number(formData.get('profileId'));
  const memberId = Number(formData.get('memberId'));
  const targetEmail = String(formData.get('targetEmail') ?? '').trim();
  const { data: m } = await supabaseAdmin().from('family_members').select('family_id').eq('id', memberId).single();
  if (!m) throw new Error('Member not found.');
  await shareDependent({ memberId, actorFamilyId: m.family_id, targetEmail, actorClerkId: session.userId! });
  back(profileId);
}

/** Re-send the claim email for an imported-but-unclaimed account. */
export async function resendClaimAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const profileId = Number(formData.get('profileId'));
  const { data: p } = await supabaseAdmin()
    .from('profiles').select('email, first_name, claim_token, claimed_at').eq('id', profileId).single();
  if (!p?.email || !p.claim_token || p.claimed_at) throw new Error('Nothing to claim for this account.');
  const appUrl = process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca';
  const res = await notify({
    to: { email: p.email },
    channels: ['email'],
    template: 'generic',
    data: {
      heading: 'Claim your Athlete Institute account',
      body: `${p.first_name ?? 'Hi'}, your Athlete Institute account has moved to our new portal. Claim it to manage registrations, schedules and payments - it takes a minute.`,
      ctaLabel: 'Claim my account',
      ctaUrl: `${appUrl}/sign-up?claim=${p.claim_token}`,
    },
  });
  await audit({ actorId: session.userId!, action: 'profile.claim-email-resent', target: `profile:${profileId}`, meta: { ok: res.ok } });
  back(profileId);
}

/** Merge another (duplicate) account INTO this one. */
export async function mergeIntoThisAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  // A merge re-points a whole household's PII + money history — gated by the
  // Module 5 sensitive-data capability (edit).
  if (session.profileId && !(await profileCan(session.profileId, 'roster_sensitive', 'edit'))) {
    throw new Error('You lack the sensitive-data capability required to merge accounts.');
  }
  const targetProfileId = Number(formData.get('profileId'));
  const sourceProfileId = Number(formData.get('sourceProfileId'));
  if (!sourceProfileId) throw new Error('Pick the duplicate account to merge in.');
  await mergeAccounts(sourceProfileId, targetProfileId, session.userId!);
  back(targetProfileId);
  redirect(`/accounts/${targetProfileId}?merged=${sourceProfileId}`);
}
