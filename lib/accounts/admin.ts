import 'server-only';
import { torontoToday } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { ensureSeasonCredit, getDefaultCreditCapCents, type StaffCreditState } from '@/lib/credits';
import { loadFamily, type Family } from '@/lib/family';
import type { Profile } from '@/lib/profile';
import { householdOutstanding, type HouseholdOutstanding } from '@/lib/programs/pay';

/**
 * Admin account detail (Accounts review) — one household view per profile:
 * who they are, their family, what they're registered in, what they owe,
 * their balances, roles, claim state, and an audit-log activity timeline.
 * The screen front-desk staff live in.
 */

export interface LedgerRow { id: number; delta: number; reason: string; at: string }
export interface TimelineRow { id: number; actor: string; action: string; target: string | null; meta: Record<string, unknown>; at: string }

export interface AccountDetail {
  profile: Profile & { claim_token: string | null; claimed_at: string | null; imported_from: string | null };
  roles: string[];
  family: Family | null;
  isHoh: boolean;
  registrations: Array<{ id: number; memberName: string | null; programName: string; status: string; seasonKey: string | null }>;
  outstanding: HouseholdOutstanding | null;
  pointsBalance: number;
  creditBalanceCents: number;
  pointsLedger: LedgerRow[];
  creditLedger: LedgerRow[];
  staffCredit: (StaffCreditState & { defaultCapCents: number; hasOverride: boolean }) | null;
  timeline: TimelineRow[];
}

export async function accountDetail(profileId: number): Promise<AccountDetail | null> {
  const db = supabaseAdmin();
  const { data: profile } = await db
    .from('profiles')
    .select('id, clerk_user_id, email, first_name, last_name, phone, user_type, status, settings, family_id, claim_token, claimed_at, imported_from')
    .eq('id', profileId)
    .maybeSingle();
  if (!profile) return null;

  const { data: roleRows } = await db.from('role_assignments').select('roles(name)').eq('profile_id', profileId);
  const roles = (roleRows ?? [])
    .map((r) => (r.roles as unknown as { name: string } | null)?.name)
    .filter((n): n is string => !!n);

  let family: Family | null = null;
  let registrations: AccountDetail['registrations'] = [];
  let outstanding: HouseholdOutstanding | null = null;
  let pointsBalance = 0;
  let creditBalanceCents = 0;
  let pointsLedger: LedgerRow[] = [];
  let creditLedger: LedgerRow[] = [];

  if (profile.family_id) {
    family = await loadFamily(profile.family_id);
    const { data: fam } = await db
      .from('families').select('play_points_balance, credit_balance_cents').eq('id', profile.family_id).single();
    pointsBalance = fam?.play_points_balance ?? 0;
    creditBalanceCents = fam?.credit_balance_cents ?? 0;

    const memberName = new Map(family.members.map((m) => [m.id, `${m.first_name} ${m.last_name}`.trim()]));
    const { data: regs } = await db
      .from('registrations')
      .select('id, family_member_id, status, season_key, programs(name)')
      .eq('family_id', profile.family_id)
      .order('id', { ascending: false })
      .limit(40);
    registrations = (regs ?? []).map((r) => ({
      id: r.id,
      memberName: r.family_member_id ? memberName.get(r.family_member_id) ?? null : null,
      programName: (r.programs as unknown as { name: string } | null)?.name ?? 'Program',
      status: r.status,
      seasonKey: r.season_key,
    }));

    outstanding = await householdOutstanding(profile.family_id, torontoToday());

    const [{ data: pl }, { data: cl }] = await Promise.all([
      db.from('play_points_ledger').select('id, delta_points, reason, created_at').eq('family_id', profile.family_id).order('id', { ascending: false }).limit(10),
      db.from('credit_ledger').select('id, delta_cents, reason, created_at').eq('family_id', profile.family_id).order('id', { ascending: false }).limit(10),
    ]);
    pointsLedger = (pl ?? []).map((r) => ({ id: r.id, delta: r.delta_points, reason: r.reason, at: r.created_at }));
    creditLedger = (cl ?? []).map((r) => ({ id: r.id, delta: r.delta_cents, reason: r.reason, at: r.created_at }));
  }

  // Staff credit: reading it lazily creates/tops-up the season account, which
  // IS the season top-up mechanism (no cron needed — first read each season
  // resets the balance to cap).
  let staffCredit: AccountDetail['staffCredit'] = null;
  if (profile.user_type === 'staff') {
    const state = await ensureSeasonCredit(profileId);
    const { data: acct } = await db
      .from('staff_credit_accounts').select('cap_override_cents').eq('profile_id', profileId).maybeSingle();
    staffCredit = {
      ...state,
      defaultCapCents: await getDefaultCreditCapCents(),
      hasOverride: acct?.cap_override_cents != null,
    };
  }

  // Activity timeline: everything auditing has recorded against this profile,
  // its family, or its members (family events carry family_id in meta).
  const targets = [
    `profile:${profileId}`,
    ...(profile.family_id ? [`family:${profile.family_id}`] : []),
    ...(family?.members ?? []).map((m) => `family_member:${m.id}`),
  ];
  const orClauses = [
    `target.in.(${targets.map((t) => `"${t}"`).join(',')})`,
    ...(profile.family_id ? [`meta->>family_id.eq.${profile.family_id}`] : []),
  ];
  const { data: logRows } = await db
    .from('audit_log')
    .select('id, actor, action, target, meta, at')
    .or(orClauses.join(','))
    .order('at', { ascending: false })
    .limit(60);
  const timeline: TimelineRow[] = (logRows ?? []).map((r) => ({
    id: r.id, actor: r.actor, action: r.action, target: r.target,
    meta: (r.meta ?? {}) as Record<string, unknown>, at: r.at,
  }));

  return {
    profile: profile as AccountDetail['profile'],
    roles,
    family,
    isHoh: !!family && family.hoh_profile_id === profileId,
    registrations,
    outstanding,
    pointsBalance,
    creditBalanceCents,
    pointsLedger,
    creditLedger,
    staffCredit,
    timeline,
  };
}

/** Lightweight search for the merge picker (name/email match, excludes self + merged shells). */
export async function searchAccounts(q: string, excludeProfileId?: number, limit = 8) {
  const db = supabaseAdmin();
  let query = db
    .from('profiles')
    .select('id, first_name, last_name, email, user_type, status')
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
    .neq('status', 'archived')
    .limit(limit);
  if (excludeProfileId) query = query.neq('id', excludeProfileId);
  const { data } = await query;
  return data ?? [];
}
