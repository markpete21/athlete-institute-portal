import 'server-only';
import { randomBytes } from 'node:crypto';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { deriveStandingFor } from '@/lib/programs/programs';

/**
 * Club (Module 11). A program-type front-end over Module 4 (billing/waivers/
 * jerseys) + Module 6 (manual rostering/schedule/standings). Centerpiece: the
 * tryout -> evaluation -> offer -> confirmation pipeline. Team messaging is a
 * SEPARATE app - only the confirmed-roster handoff hook lives here.
 *
 * Status ladder: (tryout) unrated -> selected/considering/out
 *                (team)    -> offered_pending -> confirmed/declined
 */

export type Gender = 'girls' | 'boys' | 'mixed';
export type Flag = 'unrated' | 'selected' | 'considering' | 'out' | 'offered_pending' | 'confirmed' | 'declined';

// --- structure --------------------------------------------------------------

export async function createClub(input: { name: string; sport?: string | null; brandKey?: string | null }, actorClerkId: string): Promise<number> {
  const { data, error } = await supabaseAdmin().from('clubs').insert({ name: input.name.trim(), sport: input.sport ?? null, brand_key: input.brandKey ?? null }).select('id').single();
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'club.created', target: `club:${data.id}` });
  return data.id;
}

export async function createTeam(input: {
  clubId: number;
  name: string;
  levelLabel: string;      // free text - "15U" (vb) vs "U15" (bball) per club
  gender: Gender;
  dobMin?: string | null;  // eligibility window (inclusive)
  dobMax?: string | null;
  seasonFeeCents: number;
  divisionId?: number | null;
  seasonProgramId?: number | null;
}, actorClerkId: string): Promise<number> {
  const { data, error } = await supabaseAdmin()
    .from('club_teams')
    .insert({
      club_id: input.clubId, name: input.name.trim(), level_label: input.levelLabel.trim(), gender: input.gender,
      dob_min: input.dobMin ?? null, dob_max: input.dobMax ?? null, season_fee_cents: input.seasonFeeCents,
      division_id: input.divisionId ?? null, season_program_id: input.seasonProgramId ?? null,
    })
    .select('id').single();
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'club.team-created', target: `club-team:${data.id}`, meta: { club: input.clubId } });
  return data.id;
}

/** Per-team DOB eligibility. Age label is display only; the DOB window is the rule. */
export function dobEligible(dob: string | null, team: { dob_min: string | null; dob_max: string | null }): boolean {
  if (!dob) return !team.dob_min && !team.dob_max; // no DOB on file passes only if team has no window
  if (team.dob_min && dob < team.dob_min) return false;
  if (team.dob_max && dob > team.dob_max) return false;
  return true;
}

// --- tryouts + consolidated roster -----------------------------------------

/** Register an M4 program as a tryout session for a club level+gender group. */
export async function addTryoutSession(input: { clubId: number; programId: number; levelLabel: string; gender: Gender }, actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('club_tryout_sessions').insert({ club_id: input.clubId, program_id: input.programId, level_label: input.levelLabel.trim(), gender: input.gender });
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'club.tryout-session-added', target: `program:${input.programId}`, meta: { club: input.clubId, level: input.levelLabel, gender: input.gender } });
}

/**
 * Consolidate every tryout registration for a level+gender group (across all
 * its sessions) into ONE tryout roster. Idempotent: existing players keep their
 * flag/rating/notes; new registrants are added as 'unrated'.
 */
export async function syncTryoutRoster(clubId: number, levelLabel: string, gender: Gender): Promise<number> {
  const db = supabaseAdmin();
  const { data: sessions } = await db.from('club_tryout_sessions').select('program_id').eq('club_id', clubId).eq('level_label', levelLabel).eq('gender', gender);
  const programIds = (sessions ?? []).map((s) => s.program_id);
  if (programIds.length === 0) return 0;

  const { data: regs } = await db.from('registrations').select('family_member_id, family_id').in('program_id', programIds).in('status', ['active', 'waitlisted']);
  // Dedupe by member - one roster row even if they attended multiple sessions.
  const byMember = new Map<number, number | null>();
  for (const r of regs ?? []) if (!byMember.has(r.family_member_id)) byMember.set(r.family_member_id, r.family_id);

  let added = 0;
  for (const [memberId, familyId] of byMember) {
    const { data, error } = await db
      .from('club_tryout_players')
      .upsert({ club_id: clubId, level_label: levelLabel, gender, family_member_id: memberId, family_id: familyId }, { onConflict: 'club_id,level_label,gender,family_member_id', ignoreDuplicates: true })
      .select('id');
    if (error) throw new Error(error.message);
    if (data && data.length) added += 1;
  }
  return added;
}

export interface EvalRow { number: number; playerId: number; name: string; dob: string | null; flag: Flag; rating: number | null; notes: string | null }

/** Numbered evaluation-sheet rows for a group (print-and-fill PDF: number, 1-5, notes). */
export async function evaluationSheet(clubId: number, levelLabel: string, gender: Gender): Promise<EvalRow[]> {
  const db = supabaseAdmin();
  const { data } = await db
    .from('club_tryout_players')
    .select('id, rating, notes, flag, family_members(first_name, last_name, dob)')
    .eq('club_id', clubId).eq('level_label', levelLabel).eq('gender', gender)
    .order('id');
  return (data ?? []).map((p, i) => {
    const m = p.family_members as unknown as { first_name: string; last_name: string; dob: string | null };
    return { number: i + 1, playerId: p.id, name: `${m.first_name} ${m.last_name}`, dob: m.dob, flag: p.flag as Flag, rating: p.rating, notes: p.notes };
  });
}

/** Flag a player (Selected/Considering/Out). Selected optionally moves them onto a team. */
export async function setFlag(playerId: number, flag: Extract<Flag, 'selected' | 'considering' | 'out'>, actorClerkId: string, teamId?: number | null): Promise<void> {
  const patch: Record<string, unknown> = { flag };
  if (flag === 'selected' && teamId) patch.team_id = teamId;
  const { error } = await supabaseAdmin().from('club_tryout_players').update(patch).eq('id', playerId);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'club.player-flagged', target: `club-player:${playerId}`, meta: { flag, teamId } });
}

export async function saveEvaluation(playerId: number, rating: number | null, notes: string | null): Promise<void> {
  const { error } = await supabaseAdmin().from('club_tryout_players').update({ rating, notes }).eq('id', playerId);
  if (error) throw new Error(error.message);
}

// --- offers + digital acceptance -------------------------------------------

export interface SendOfferInput {
  playerId: number;
  teamId: number;
  mode: 'verbal' | 'deposit';
  depositCents?: number | null;  // set-amount deposit
  depositPct?: number | null;    // OR percent of season fee
}

/** Send an offer (flips flag to Offered - Pending, mints a digital accept token). */
export async function sendOffer(input: SendOfferInput, actorClerkId: string): Promise<{ offerId: number; token: string }> {
  const db = supabaseAdmin();
  if (input.mode === 'deposit' && !input.depositCents && !input.depositPct) throw new Error('A deposit offer needs a set amount or a percentage.');
  const token = randomBytes(12).toString('base64url');
  const { data, error } = await db
    .from('club_offers')
    .insert({ player_id: input.playerId, team_id: input.teamId, mode: input.mode, deposit_cents: input.depositCents ?? null, deposit_pct: input.depositPct ?? null, token })
    .select('id').single();
  if (error) throw new Error(error.message);
  await db.from('club_tryout_players').update({ flag: 'offered_pending', team_id: input.teamId }).eq('id', input.playerId);
  await audit({ actorId: actorClerkId, action: 'club.offer-sent', target: `club-offer:${data.id}`, meta: { player: input.playerId, team: input.teamId, mode: input.mode } });
  return { offerId: data.id, token };
}

/** Bulk-send the same offer terms to many players. */
export async function bulkSendOffers(playerIds: number[], teamId: number, terms: Omit<SendOfferInput, 'playerId' | 'teamId'>, actorClerkId: string): Promise<Array<{ playerId: number; offerId: number; token: string }>> {
  const out = [];
  for (const playerId of playerIds) {
    const r = await sendOffer({ playerId, teamId, ...terms }, actorClerkId);
    out.push({ playerId, ...r });
  }
  return out;
}

/** Staff manually cancel an offer (no expiry). Player returns to Selected. */
export async function cancelOffer(offerId: number, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: offer } = await db.from('club_offers').select('player_id, status').eq('id', offerId).single();
  if (!offer) throw new Error('Offer not found.');
  await db.from('club_offers').update({ status: 'cancelled' }).eq('id', offerId);
  if (offer.status === 'pending') await db.from('club_tryout_players').update({ flag: 'selected' }).eq('id', offer.player_id);
  await audit({ actorId: actorClerkId, action: 'club.offer-cancelled', target: `club-offer:${offerId}` });
}

/** The deposit amount an offer requires (set amount, or % of the team season fee). */
export function depositForOffer(offer: { mode: string; deposit_cents: number | null; deposit_pct: number | null }, seasonFeeCents: number): number {
  if (offer.mode !== 'deposit') return 0;
  if (offer.deposit_cents != null) return offer.deposit_cents;
  if (offer.deposit_pct != null) return Math.round((seasonFeeCents * offer.deposit_pct) / 100);
  return 0;
}

export interface OfferView {
  offerId: number;
  status: string;
  mode: string;
  playerName: string;
  teamName: string;
  seasonFeeCents: number;
  depositCents: number;
  remainingCents: number;
}

/** Load an offer by its digital-acceptance token (for the confirm/deny page). */
export async function getOfferByToken(token: string): Promise<OfferView | null> {
  const db = supabaseAdmin();
  const { data: offer } = await db
    .from('club_offers')
    .select('id, status, mode, deposit_cents, deposit_pct, club_tryout_players(family_members(first_name, last_name)), club_teams(name, season_fee_cents)')
    .eq('token', token).maybeSingle();
  if (!offer) return null;
  const team = offer.club_teams as unknown as { name: string; season_fee_cents: number };
  const player = (offer.club_tryout_players as unknown as { family_members: { first_name: string; last_name: string } }).family_members;
  const depositCents = depositForOffer(offer, team.season_fee_cents);
  return {
    offerId: offer.id, status: offer.status, mode: offer.mode,
    playerName: `${player.first_name} ${player.last_name}`, teamName: team.name,
    seasonFeeCents: team.season_fee_cents, depositCents, remainingCents: Math.max(0, team.season_fee_cents - depositCents),
  };
}

export interface RespondResult { flag: Flag; seasonRegistrationId: number | null; depositAppliedCents: number; remainingCents: number }

/**
 * Player/parent confirms or denies via the digital link. On confirm: create the
 * Module 4 season registration, apply the deposit toward the season fee (deposit
 * is NOT additional), leaving the remaining balance for the M4 payment plan at
 * checkout. On deny: flag Declined (staff can offer a Considering player next).
 */
export async function respondToOffer(token: string, accept: boolean, actorClerkId: string): Promise<RespondResult> {
  const db = supabaseAdmin();
  const { data: offer, error } = await db
    .from('club_offers')
    .select('id, status, mode, deposit_cents, deposit_pct, player_id, team_id, club_teams(season_fee_cents, season_program_id)')
    .eq('token', token).single();
  if (error) throw new Error('Offer not found.');
  if (offer.status !== 'pending') throw new Error('This offer has already been responded to.');
  const team = offer.club_teams as unknown as { season_fee_cents: number; season_program_id: number | null };

  if (!accept) {
    await db.from('club_offers').update({ status: 'declined' }).eq('id', offer.id);
    await db.from('club_tryout_players').update({ flag: 'declined' }).eq('id', offer.player_id);
    await audit({ actorId: actorClerkId, action: 'club.offer-declined', target: `club-offer:${offer.id}` });
    return { flag: 'declined', seasonRegistrationId: null, depositAppliedCents: 0, remainingCents: 0 };
  }

  const depositCents = depositForOffer(offer, team.season_fee_cents);
  const remainingCents = Math.max(0, team.season_fee_cents - depositCents);

  // Create the season registration (billing/payment-plan runs via M4 at checkout).
  let seasonRegistrationId: number | null = null;
  if (team.season_program_id) {
    const { data: player } = await db.from('club_tryout_players').select('family_member_id, family_id').eq('id', offer.player_id).single();
    const standing = await deriveStandingFor(player!.family_member_id, team.season_program_id);
    const { data: reg, error: rErr } = await db
      .from('registrations')
      .insert({ program_id: team.season_program_id, family_member_id: player!.family_member_id, family_id: player!.family_id, status: 'active', standing })
      .select('id').single();
    if (rErr) throw new Error(`season registration failed: ${rErr.message}`);
    seasonRegistrationId = reg.id;
  }

  await db.from('club_offers').update({ status: 'confirmed', applied_deposit_cents: depositCents, season_registration_id: seasonRegistrationId, confirmed_at: new Date().toISOString() }).eq('id', offer.id);
  await db.from('club_tryout_players').update({ flag: 'confirmed' }).eq('id', offer.player_id);
  await audit({ actorId: actorClerkId, action: 'club.offer-confirmed', target: `club-offer:${offer.id}`, meta: { depositCents, remainingCents, seasonRegistrationId } });
  return { flag: 'confirmed', seasonRegistrationId, depositAppliedCents: depositCents, remainingCents };
}

/**
 * Confirmed-roster handoff hook for the separate club-management app: the
 * confirmed players on a team + their season registration + the linked M6
 * division for schedule/standings. Messaging is built there, not here.
 */
export async function confirmedRosterHandoff(teamId: number): Promise<{ teamId: number; divisionId: number | null; players: Array<{ playerId: number; familyMemberId: number }> }> {
  const db = supabaseAdmin();
  const { data: team } = await db.from('club_teams').select('division_id').eq('id', teamId).single();
  const { data: players } = await db.from('club_tryout_players').select('id, family_member_id').eq('team_id', teamId).eq('flag', 'confirmed');
  return { teamId, divisionId: team?.division_id ?? null, players: (players ?? []).map((p) => ({ playerId: p.id, familyMemberId: p.family_member_id })) };
}
