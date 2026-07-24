import 'server-only';
import { DEFAULT_WEIGHTS, assessRisk, audit, seasonForDate, type RetentionSignals, type RiskAssessment, type RuleWeights } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { fireTrigger } from '@/lib/comms/notifications';

/**
 * Predictive retention (Module 16). Aggregates signals the system ALREADY
 * generates (no new tracking) per returning-eligible participant, runs the
 * transparent rule engine, and stores person + reasons + suggested actions.
 * INTERNAL-ONLY (PIPEDA): purpose-limited to retention; never shown to families.
 */

export async function currentWeights(): Promise<RuleWeights> {
  const { data } = await supabaseAdmin().from('retention_weights').select('weights').eq('id', 1).maybeSingle();
  return { ...DEFAULT_WEIGHTS, ...((data?.weights ?? {}) as Partial<RuleWeights>) };
}

export async function updateWeights(patch: Partial<RuleWeights>, actorClerkId: string): Promise<void> {
  const merged = { ...(await currentWeights()), ...patch };
  await supabaseAdmin().from('retention_weights').update({ weights: merged, updated_by: actorClerkId, updated_at: new Date().toISOString() }).eq('id', 1);
  await audit({ actorId: actorClerkId, action: 'retention.weights-updated', target: 'retention_weights', meta: patch });
}

/** Gather this member's signals from existing module data (no new tracking). */
export async function gatherSignals(familyMemberId: number, familyId: number | null, opts: { asOf?: Date } = {}): Promise<RetentionSignals> {
  const db = supabaseAdmin();
  const asOf = opts.asOf ?? new Date();
  const d90 = new Date(asOf.getTime() - 90 * 86_400_000).toISOString();
  const d180 = new Date(asOf.getTime() - 180 * 86_400_000).toISOString();

  // Their own registrations, newest first.
  const { data: regs } = await db
    .from('registrations')
    .select('created_at, status, program_id, programs(season_key)')
    .eq('family_member_id', familyMemberId)
    .order('created_at', { ascending: false });
  const rows = regs ?? [];

  // Re-enroll timing vs OWN history: last season they registered by month-day X.
  let daysPastOwnReenrollDate: number | null = null;
  const thisSeason = seasonForDate(asOf.toISOString().slice(0, 10));
  const currentSeasonReg = rows.find((r) => (r.programs as unknown as { season_key: string | null } | null)?.season_key?.includes(thisSeason.key ?? '') && ['active', 'waitlisted'].includes(r.status));
  if (!currentSeasonReg && rows.length) {
    const lastReg = rows[0];
    const last = new Date(lastReg.created_at);
    // Their historical registration anniversary this year.
    const anniversary = new Date(Date.UTC(asOf.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate()));
    if (anniversary > asOf) anniversary.setUTCFullYear(anniversary.getUTCFullYear() - 1);
    const days = Math.floor((asOf.getTime() - anniversary.getTime()) / 86_400_000);
    // Only meaningful if they haven't registered SINCE that anniversary.
    if (Date.parse(lastReg.created_at) < anniversary.getTime() && days > 0 && days < 365) daysPastOwnReenrollDate = days;
  }

  // Latest feedback rating-of-record.
  const { data: fb } = await db
    .from('feedback_responses').select('rating, registrations!inner(family_member_id)')
    .eq('registrations.family_member_id', familyMemberId)
    .not('rating', 'is', null).order('id', { ascending: false }).limit(1).maybeSingle();

  // Abandoned re-registration: a live-or-expired cart item with no registration.
  const { count: abandonedCount } = await db
    .from('cart_items').select('id', { count: 'exact', head: true })
    .eq('family_member_id', familyMemberId);
  const abandonedReRegistration = (abandonedCount ?? 0) > 0 && !currentSeasonReg;

  // Payment friction: failed installments on this family's orders.
  let failedPayments = 0;
  if (familyId) {
    const { data: orders } = await db.from('program_orders').select('id').eq('family_id', familyId);
    const ids = (orders ?? []).map((o) => o.id);
    if (ids.length) {
      const { count } = await db.from('program_installments').select('id', { count: 'exact', head: true }).in('order_id', ids).eq('status', 'failed');
      failedPayments = count ?? 0;
    }
  }

  // Email engagement trend from M13 recipient rows (via HoH email).
  let emailOpensRecent = 0, emailOpensPrior = 0;
  if (familyId) {
    const { data: fam } = await db.from('families').select('hoh_profile_id').eq('id', familyId).maybeSingle();
    if (fam?.hoh_profile_id) {
      const { data: prof } = await db.from('profiles').select('email').eq('id', fam.hoh_profile_id).maybeSingle();
      if (prof?.email) {
        const { count: rec } = await db.from('comms_recipients').select('id', { count: 'exact', head: true }).eq('email', prof.email).gte('opened_at', d90);
        const { count: pri } = await db.from('comms_recipients').select('id', { count: 'exact', head: true }).eq('email', prof.email).gte('opened_at', d180).lt('opened_at', d90);
        emailOpensRecent = rec ?? 0;
        emailOpensPrior = pri ?? 0;
      }
    }
  }

  // Sibling gap: another member of the family HAS a current-season registration.
  let siblingGap = false;
  if (familyId && !currentSeasonReg && rows.length) {
    const { data: sibRegs } = await db
      .from('registrations').select('family_member_id, created_at')
      .eq('family_id', familyId).neq('family_member_id', familyMemberId)
      .in('status', ['active', 'waitlisted']).gte('created_at', d90);
    siblingGap = (sibRegs ?? []).length > 0;
  }

  // Cross-app engagement trend: audit-log events for this family's actors
  // (shared ecosystem writes activity here; trend > absolute level).
  let crossAppEventsRecent = 0, crossAppEventsPrior = 0;
  if (familyId) {
    const { count: rec } = await db.from('audit_log').select('id', { count: 'exact', head: true }).eq('target', `family:${familyId}`).gte('created_at', d90);
    const { count: pri } = await db.from('audit_log').select('id', { count: 'exact', head: true }).eq('target', `family:${familyId}`).gte('created_at', d180).lt('created_at', d90);
    crossAppEventsRecent = rec ?? 0;
    crossAppEventsPrior = pri ?? 0;
  }

  return {
    daysPastOwnReenrollDate,
    feedbackRating: fb?.rating ?? null,
    abandonedReRegistration,
    failedPayments,
    emailOpensRecent,
    emailOpensPrior,
    siblingGap,
    crossAppEventsRecent,
    crossAppEventsPrior,
  };
}

/** Assess one member and persist the flag (person + reasons + actions). */
export async function computeFlag(familyMemberId: number, familyId: number | null, opts: { signals?: RetentionSignals } = {}): Promise<RiskAssessment> {
  const db = supabaseAdmin();
  const weights = await currentWeights();
  const signals = opts.signals ?? (await gatherSignals(familyMemberId, familyId));
  const assessment = assessRisk(signals, weights);
  await db.from('retention_flags').upsert({
    family_member_id: familyMemberId,
    family_id: familyId,
    score: assessment.score,
    level: assessment.level,
    reasons: assessment.reasons,
    signals,
    computed_at: new Date().toISOString(),
  }, { onConflict: 'family_member_id' });
  return assessment;
}

/** Recompute flags for every returning-eligible member (cron). */
export async function recomputeAll(): Promise<{ computed: number; red: number; amber: number }> {
  const db = supabaseAdmin();
  // Returning-eligible = has at least one past registration.
  const { data: members } = await db.from('registrations').select('family_member_id, family_id').in('status', ['active', 'withdrawn']);
  const seen = new Set<number>();
  let computed = 0, red = 0, amber = 0;
  for (const m of members ?? []) {
    if (seen.has(m.family_member_id)) continue;
    seen.add(m.family_member_id);
    const a = await computeFlag(m.family_member_id, m.family_id);
    computed += 1;
    if (a.level === 'red') red += 1;
    if (a.level === 'amber') amber += 1;
  }
  return { computed, red, amber };
}

export interface FlagRow {
  flagId: number;
  memberName: string;
  familyId: number | null;
  score: number;
  level: string;
  reasons: Array<{ reason: string; suggestedAction: string }>;
  actionTaken: string | null;
}

/** Sortable at-risk list for the dashboard (red+amber, highest score first). */
export async function atRiskList(): Promise<FlagRow[]> {
  const { data } = await supabaseAdmin()
    .from('retention_flags')
    .select('id, family_id, score, level, reasons, action_taken, family_members(first_name, last_name)')
    .in('level', ['red', 'amber'])
    .order('score', { ascending: false });
  return (data ?? []).map((f) => {
    const m = f.family_members as unknown as { first_name: string; last_name: string } | null;
    return {
      flagId: f.id, memberName: m ? `${m.first_name} ${m.last_name}` : 'Unknown', familyId: f.family_id,
      score: f.score, level: f.level, reasons: (f.reasons ?? []) as FlagRow['reasons'], actionTaken: f.action_taken,
    };
  });
}

/** One-click actions: targeted offer / call task / returning-athlete discount. */
export async function takeAction(flagId: number, kind: 'offer' | 'call' | 'discount', actorClerkId: string, note?: string): Promise<void> {
  const db = supabaseAdmin();
  await db.from('retention_tasks').insert({ flag_id: flagId, kind, note: note ?? null, created_by: actorClerkId });
  await db.from('retention_flags').update({ actioned_at: new Date().toISOString(), actioned_by: actorClerkId, action_taken: kind }).eq('id', flagId);
  await audit({ actorId: actorClerkId, action: `retention.action-${kind}`, target: `retention_flag:${flagId}`, meta: { note } });
}

/** Weekly staff digest: "N families at risk this week." */
export async function sendWeeklyDigest(staffEmail = process.env.OPERATIONS_EMAIL ?? null): Promise<{ sent: boolean; count: number }> {
  const { count } = await supabaseAdmin().from('retention_flags').select('id', { count: 'exact', head: true }).in('level', ['red', 'amber']);
  if (!staffEmail) return { sent: false, count: count ?? 0 };
  await fireTrigger('retention.weekly_digest', { email: staffEmail }, {
    count: count ?? 0,
    dashboard_url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://admin.athleteinstitute.ca'}/retention`,
  });
  return { sent: true, count: count ?? 0 };
}
