import 'server-only';
import { randomBytes } from 'node:crypto';
import {
  academyPlanSchedule, academyRetention, audit, planCompletesBy, processingFeeCents,
  tuitionAfterScholarship, type AcademyPlan, type PaymentMethod, type TuitionTier,
} from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { deriveStandingFor } from '@/lib/programs/programs';

/**
 * Academy (Module 12) - the final program-type front-end. Pure enrollment +
 * billing over Module 4; NO tryouts, NO Competitive Play. Recruitment offer
 * pipeline, tuition tiers + per-player scholarships (applied pre-plan),
 * staff-dictated plans completing by Feb 1, processing fee waived on PAD,
 * full-year tuition commitment. Messaging is a separate app (handoff hook only).
 *
 * Status ladder: selected -> offered -> accepted / declined.
 */

const TUITION_COL: Record<TuitionTier, string> = {
  room_board: 'tuition_room_board_cents',
  commuter: 'tuition_commuter_cents',
  international: 'tuition_international_cents',
};

// --- structure --------------------------------------------------------------

export async function createTeam(input: {
  academyId: number;
  name: string;
  coachStaffId?: number | null;
  capacity?: number | null;
  tuition: { room_board: number; commuter: number; international: number };
  seasonProgramId?: number | null;
}, actorClerkId: string): Promise<number> {
  const { data, error } = await supabaseAdmin().from('academy_teams').insert({
    academy_id: input.academyId, name: input.name.trim(), coach_staff_id: input.coachStaffId ?? null, capacity: input.capacity ?? null,
    tuition_room_board_cents: input.tuition.room_board, tuition_commuter_cents: input.tuition.commuter, tuition_international_cents: input.tuition.international,
    season_program_id: input.seasonProgramId ?? null,
  }).select('id').single();
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'academy.team-created', target: `academy-team:${data.id}` });
  return data.id;
}

// --- recruitment pipeline ---------------------------------------------------

/**
 * Bring a player into the pipeline: move an existing account (by family member)
 * or a newly created one, and place them onto a team -> Selected. Idempotent per
 * (academy, member).
 */
export async function placeOnTeam(input: { academyId: number; teamId: number; familyMemberId: number; familyId: number | null; returning?: boolean }, actorClerkId: string): Promise<number> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('academy_players')
    .upsert({ academy_id: input.academyId, team_id: input.teamId, family_member_id: input.familyMemberId, family_id: input.familyId, status: 'selected', returning_flag: input.returning ?? false }, { onConflict: 'academy_id,family_member_id' })
    .select('id').single();
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'academy.player-placed', target: `academy-player:${data.id}`, meta: { team: input.teamId, returning: input.returning ?? false } });
  return data.id;
}

/** Set a per-player flat-rate scholarship (partial allowed), applied pre-plan. */
export async function setScholarship(playerId: number, scholarshipCents: number, actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('academy_players').update({ scholarship_cents: Math.max(0, scholarshipCents) }).eq('id', playerId);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'academy.scholarship-set', target: `academy-player:${playerId}`, meta: { scholarshipCents } });
}

export interface SendOfferInput { playerId: number; teamId: number; tuitionTier: TuitionTier; depositCents?: number | null; depositPct?: number | null }

/** Send a recruitment offer (single). Player -> Offered, mints an accept token. */
export async function sendOffer(input: SendOfferInput, actorClerkId: string): Promise<{ offerId: number; token: string }> {
  const db = supabaseAdmin();
  const token = randomBytes(12).toString('base64url');
  const { data, error } = await db.from('academy_offers').insert({
    player_id: input.playerId, team_id: input.teamId, tuition_tier: input.tuitionTier,
    deposit_cents: input.depositCents ?? null, deposit_pct: input.depositPct ?? null, token,
  }).select('id').single();
  if (error) throw new Error(error.message);
  await db.from('academy_players').update({ status: 'offered', tuition_tier: input.tuitionTier }).eq('id', input.playerId);
  await audit({ actorId: actorClerkId, action: 'academy.offer-sent', target: `academy-offer:${data.id}`, meta: { team: input.teamId, tier: input.tuitionTier } });
  return { offerId: data.id, token };
}

export async function bulkSendOffers(inputs: SendOfferInput[], actorClerkId: string): Promise<Array<{ playerId: number; offerId: number; token: string }>> {
  const out = [];
  for (const i of inputs) out.push({ playerId: i.playerId, ...(await sendOffer(i, actorClerkId)) });
  return out;
}

/** Base tuition for a team+tier (pre-scholarship). */
async function teamTuition(db: ReturnType<typeof supabaseAdmin>, teamId: number, tier: TuitionTier): Promise<{ tuitionCents: number; seasonProgramId: number | null }> {
  const { data: team } = await db.from('academy_teams').select('tuition_room_board_cents, tuition_commuter_cents, tuition_international_cents, season_program_id').eq('id', teamId).single();
  const tuitionCents = (team as unknown as Record<string, number> | null)?.[TUITION_COL[tier]] ?? 0;
  return { tuitionCents, seasonProgramId: team?.season_program_id ?? null };
}

export interface OfferView {
  offerId: number; status: string; playerName: string; teamName: string; tuitionTier: TuitionTier;
  tuitionCents: number; scholarshipCents: number; netTuitionCents: number; depositCents: number; remainingCents: number;
}

/** Load an offer by digital-acceptance token (for the confirm/decline page). */
export async function getOfferByToken(token: string): Promise<OfferView | null> {
  const db = supabaseAdmin();
  const { data: offer } = await db
    .from('academy_offers')
    .select('id, status, tuition_tier, deposit_cents, deposit_pct, player_id, team_id, academy_players(scholarship_cents, family_members(first_name, last_name)), academy_teams(name)')
    .eq('token', token).maybeSingle();
  if (!offer) return null;
  const tier = offer.tuition_tier as TuitionTier;
  const { tuitionCents } = await teamTuition(db, offer.team_id, tier);
  const player = offer.academy_players as unknown as { scholarship_cents: number; family_members: { first_name: string; last_name: string } };
  const netTuition = tuitionAfterScholarship(tuitionCents, player.scholarship_cents);
  const depositCents = offer.deposit_cents != null ? offer.deposit_cents : offer.deposit_pct != null ? Math.round((netTuition * offer.deposit_pct) / 100) : 0;
  return {
    offerId: offer.id, status: offer.status, playerName: `${player.family_members.first_name} ${player.family_members.last_name}`,
    teamName: (offer.academy_teams as unknown as { name: string }).name, tuitionTier: tier,
    tuitionCents, scholarshipCents: player.scholarship_cents, netTuitionCents: netTuition, depositCents, remainingCents: Math.max(0, netTuition - depositCents),
  };
}

export interface AcceptResult { status: string; seasonRegistrationId: number | null; netTuitionCents: number; depositCents: number; plan: AcademyPlan | null }

/**
 * Player/parent accepts or declines via the digital link. On accept: apply the
 * scholarship (pre-plan), take the required deposit (applied toward tuition),
 * create the M4 season registration, and build the staff-dictated payment plan
 * (front-loaded, completes by the academy's Feb-1 date). Decline -> Declined.
 */
export async function respondToOffer(token: string, accept: boolean, actorClerkId: string): Promise<AcceptResult> {
  const db = supabaseAdmin();
  const { data: offer, error } = await db
    .from('academy_offers')
    .select('id, status, tuition_tier, deposit_cents, deposit_pct, player_id, team_id, academy_players(academy_id, scholarship_cents, family_member_id, family_id)')
    .eq('token', token).single();
  if (error) throw new Error('Offer not found.');
  if (offer.status !== 'pending') throw new Error('This offer has already been responded to.');
  const player = offer.academy_players as unknown as { academy_id: number; scholarship_cents: number; family_member_id: number; family_id: number | null };

  if (!accept) {
    await db.from('academy_offers').update({ status: 'declined' }).eq('id', offer.id);
    await db.from('academy_players').update({ status: 'declined' }).eq('id', offer.player_id);
    await audit({ actorId: actorClerkId, action: 'academy.offer-declined', target: `academy-offer:${offer.id}` });
    return { status: 'declined', seasonRegistrationId: null, netTuitionCents: 0, depositCents: 0, plan: null };
  }

  const tier = offer.tuition_tier as TuitionTier;
  const { tuitionCents, seasonProgramId } = await teamTuition(db, offer.team_id, tier);
  const netTuition = tuitionAfterScholarship(tuitionCents, player.scholarship_cents); // scholarship BEFORE plan
  const depositCents = offer.deposit_cents != null ? offer.deposit_cents : offer.deposit_pct != null ? Math.round((netTuition * offer.deposit_pct) / 100) : 0;

  // Season registration (M4). Payment plan built from academy Feb-1 completion.
  let seasonRegistrationId: number | null = null;
  if (seasonProgramId) {
    const standing = await deriveStandingFor(player.family_member_id, seasonProgramId);
    const { data: reg, error: rErr } = await db
      .from('registrations')
      .insert({ program_id: seasonProgramId, family_member_id: player.family_member_id, family_id: player.family_id, status: 'active', standing })
      .select('id').single();
    if (rErr) throw new Error(`season registration failed: ${rErr.message}`);
    seasonRegistrationId = reg.id;
  }

  const { data: academy } = await db.from('academies').select('plan_complete_by').eq('id', player.academy_id).single();
  const plan = academyPlanSchedule({
    totalCents: netTuition,
    depositCents,
    firstDueISO: firstOfNextMonth(),
    planCompleteByISO: academy?.plan_complete_by ?? seasonFeb1(),
  });

  await db.from('academy_offers').update({ status: 'accepted', applied_deposit_cents: depositCents, accepted_at: new Date().toISOString() }).eq('id', offer.id);
  await db.from('academy_players').update({ status: 'accepted', tuition_tier: tier, deposit_cents: depositCents, season_registration_id: seasonRegistrationId }).eq('id', offer.player_id);
  await audit({ actorId: actorClerkId, action: 'academy.offer-accepted', target: `academy-offer:${offer.id}`, meta: { netTuition, depositCents, installments: plan.installments.length } });
  return { status: 'accepted', seasonRegistrationId, netTuitionCents: netTuition, depositCents, plan };
}

function firstOfNextMonth(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 2; // next month, 1-indexed
  const yy = m > 12 ? y + 1 : y;
  const mm = ((m - 1) % 12) + 1;
  return `${yy}-${String(mm).padStart(2, '0')}-01`;
}

function seasonFeb1(): string {
  const now = new Date();
  // Season spans Sept-June; the completing Feb 1 is next calendar year if we're past Feb.
  const y = now.getUTCMonth() >= 1 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  return `${y}-02-01`;
}

/** The processing fee for a payment, waived on PAD (bank debit). */
export async function processingFeeFor(academyId: number, baseCents: number, method: PaymentMethod): Promise<number> {
  const { data: academy } = await supabaseAdmin().from('academies').select('processing_fee_percent').eq('id', academyId).single();
  return processingFeeCents(baseCents, method, Number(academy?.processing_fee_percent ?? 0));
}

// --- dashboard + retention + re-enrollment + handoff ------------------------

export interface AcademyDashboard {
  scholarshipTotalCents: number;
  scholarshipsByPlayer: Array<{ playerId: number; name: string; scholarshipCents: number }>;
  acceptedCount: number;
  pipelineByStatus: Record<string, number>;
}

/** Academy dashboard: scholarships awarded (total + per player), pipeline counts. */
export async function dashboard(academyId: number): Promise<AcademyDashboard> {
  const db = supabaseAdmin();
  const { data: players } = await db
    .from('academy_players')
    .select('id, status, scholarship_cents, family_members(first_name, last_name)')
    .eq('academy_id', academyId);
  const rows = players ?? [];
  const pipelineByStatus: Record<string, number> = {};
  let scholarshipTotalCents = 0;
  const scholarshipsByPlayer: AcademyDashboard['scholarshipsByPlayer'] = [];
  for (const p of rows) {
    pipelineByStatus[p.status] = (pipelineByStatus[p.status] ?? 0) + 1;
    if (p.scholarship_cents > 0) {
      const m = p.family_members as unknown as { first_name: string; last_name: string };
      scholarshipTotalCents += p.scholarship_cents;
      scholarshipsByPlayer.push({ playerId: p.id, name: `${m.first_name} ${m.last_name}`, scholarshipCents: p.scholarship_cents });
    }
  }
  return { scholarshipTotalCents, scholarshipsByPlayer, acceptedCount: pipelineByStatus.accepted ?? 0, pipelineByStatus };
}

/** Season-over-season retention for an academy (returning accepted / prior accepted). */
export async function retention(lastSeasonMemberIds: number[], thisSeasonMemberIds: number[]): Promise<number> {
  return academyRetention(lastSeasonMemberIds, thisSeasonMemberIds);
}

/**
 * Re-enrollment: returning accepted players from a prior season get a fresh
 * enrollment offer for the next season without re-entering the full pipeline -
 * placed back Selected (returning flag) then offered.
 */
export async function reEnroll(playerIds: number[], terms: Omit<SendOfferInput, 'playerId'>, actorClerkId: string): Promise<number> {
  const db = supabaseAdmin();
  let offered = 0;
  for (const playerId of playerIds) {
    await db.from('academy_players').update({ status: 'selected', returning_flag: true }).eq('id', playerId);
    await sendOffer({ playerId, ...terms }, actorClerkId);
    offered += 1;
  }
  return offered;
}

/** Confirmed-roster + schedule handoff hook for the separate academy-management app. */
export async function rosterHandoff(teamId: number): Promise<{ teamId: number; players: Array<{ playerId: number; familyMemberId: number }> }> {
  const { data } = await supabaseAdmin().from('academy_players').select('id, family_member_id').eq('team_id', teamId).eq('status', 'accepted');
  return { teamId, players: (data ?? []).map((p) => ({ playerId: p.id, familyMemberId: p.family_member_id })) };
}

export { planCompletesBy };
