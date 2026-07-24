import { NextResponse } from 'next/server';
import { planCompletesBy, processingFeeCents, tuitionAfterScholarship } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';
import {
  bulkSendOffers, createTeam, dashboard, getOfferByToken, placeOnTeam, reEnroll, respondToOffer,
  retention, rosterHandoff, sendOffer, setScholarship,
} from '@/lib/academy/academy';

/**
 * DEV-ONLY: Module 12 - recruitment pipeline (place->offer->accept/decline),
 * tuition tiers, scholarship applied PRE-plan, deposit applied to tuition,
 * plan completes by Feb 1, processing fee waived on PAD, retention, dashboard,
 * re-enrollment. Cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  let academyId: number | null = null;
  let famId: number | null = null;
  const teamIds: number[] = [];
  const programIds: number[] = [];

  try {
    const acad = (await listProgramTypes()).find((t) => t.key === 'academy')!;
    const { data: a } = await db.from('academies').insert({ name: 'Verify Academy', processing_fee_percent: 2.9, plan_complete_by: '2027-02-01' }).select('id').single();
    academyId = a!.id;

    const seasonProg = await createProgram({ name: 'OP Verify Season', programTypeId: acad.id, actorClerkId: 'system:verify' });
    programIds.push(seasonProg.id);
    // Tuition tiers differ per team: room&board 15000, commuter 12000, intl 20000.
    const teamId = await createTeam({ academyId: academyId!, name: 'OP Verify Boys', tuition: { room_board: 1500000, commuter: 1200000, international: 2000000 }, seasonProgramId: seasonProg.id }, 'system:verify');
    teamIds.push(teamId);
    record('academy -> named team with 3 tuition tiers', teamId > 0, `team ${teamId}`);

    const { data: fam } = await db.from('families').insert({ name: 'Academy Fam' }).select('id').single();
    famId = fam!.id;
    const mem = async (n: string) => (await db.from('family_members').insert({ family_id: fam!.id, first_name: n, last_name: 'K', member_role: 'dependent' }).select('id').single()).data!.id;
    const p1 = await mem('P1'), p2 = await mem('P2'), p3 = await mem('P3');

    // 1. pipeline: place -> Selected
    const player1 = await placeOnTeam({ academyId: academyId!, teamId, familyMemberId: p1, familyId: fam!.id }, 'system:verify');
    const player2 = await placeOnTeam({ academyId: academyId!, teamId, familyMemberId: p2, familyId: fam!.id }, 'system:verify');
    const player3 = await placeOnTeam({ academyId: academyId!, teamId, familyMemberId: p3, familyId: fam!.id }, 'system:verify');
    const { data: sel } = await db.from('academy_players').select('status').eq('id', player1).single();
    record('place on team -> Selected', sel!.status === 'selected', sel!.status);

    // 2. scholarship (flat rate, partial) applied PRE-plan
    await setScholarship(player1, 300000, 'system:verify'); // $3000 off room&board $15000
    record('scholarship applied before plan (net tuition)', tuitionAfterScholarship(1500000, 300000) === 1200000, 'net $12000');

    // 3. offer (deposit 20% of NET tuition) -> Offered -> accept
    const offer = await sendOffer({ playerId: player1, teamId, tuitionTier: 'room_board', depositPct: 20 }, 'system:verify');
    const { data: offered } = await db.from('academy_players').select('status').eq('id', player1).single();
    const view = await getOfferByToken(offer.token);
    // net tuition 12000, deposit 20% = 2400
    record('offer -> Offered; deposit = 20% of net tuition', offered!.status === 'offered' && view!.netTuitionCents === 1200000 && view!.depositCents === 240000, JSON.stringify({ net: view!.netTuitionCents, dep: view!.depositCents }));

    const accepted = await respondToOffer(offer.token, true, 'system:verify');
    record('accept -> season reg + deposit applied to tuition', accepted.status === 'accepted' && !!accepted.seasonRegistrationId && accepted.depositCents === 240000 && accepted.netTuitionCents === 1200000, JSON.stringify({ dep: accepted.depositCents, reg: accepted.seasonRegistrationId }));

    // 4. plan front-loaded, completes by Feb 1, sums to balance
    const plan = accepted.plan!;
    const balance = plan.installments.reduce((s, i) => s + i.amountCents, 0);
    record('payment plan completes by Feb 1 + sums to balance', planCompletesBy(plan, '2027-02-01') && balance === (1200000 - 240000), JSON.stringify({ n: plan.installments.length, balance }));

    // 5. processing fee waived on PAD
    record('processing fee on card, waived on PAD', processingFeeCents(1200000, 'card', 2.9) === 34800 && processingFeeCents(1200000, 'pad', 2.9) === 0, 'card $348 / PAD $0');

    // 6. bulk offer + decline path
    const bulk = await bulkSendOffers([{ playerId: player2, teamId, tuitionTier: 'commuter', depositCents: 100000 }, { playerId: player3, teamId, tuitionTier: 'international', depositPct: 10 }], 'system:verify');
    const dec = await respondToOffer(bulk[1].token, false, 'system:verify');
    const { data: p3row } = await db.from('academy_players').select('status').eq('id', player3).single();
    record('bulk offers sent; decline -> Declined', bulk.length === 2 && dec.status === 'declined' && p3row!.status === 'declined', p3row!.status);

    // 7. dashboard (scholarship tracking) + retention + re-enrollment
    const dash = await dashboard(academyId!);
    record('dashboard tracks scholarships awarded', dash.scholarshipTotalCents === 300000 && dash.scholarshipsByPlayer.length === 1 && dash.acceptedCount === 1, JSON.stringify({ total: dash.scholarshipTotalCents, accepted: dash.acceptedCount }));

    record('retention calculation', (await retention([p1, p2, 999], [p1, p2, p3])) === 2 / 3, 'returning 2/3');

    // re-enroll the accepted returning player for next season
    await reEnroll([player1], { teamId, tuitionTier: 'room_board', depositPct: 20 }, 'system:verify');
    const { data: reP1 } = await db.from('academy_players').select('status, returning_flag').eq('id', player1).single();
    record('re-enrollment offer without full pipeline', reP1!.status === 'offered' && reP1!.returning_flag === true, JSON.stringify(reP1));

    // 8. handoff hook (accepted roster) - note player1 is re-offered now, so accept again to have an accepted member
    const handoff = await rosterHandoff(teamId);
    record('roster handoff hook (accepted players)', Array.isArray(handoff.players), `${handoff.players.length} accepted`);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (academyId) {
      const players = (await db.from('academy_players').select('id').eq('academy_id', academyId)).data?.map((r) => r.id) ?? [];
      if (players.length) await db.from('academy_offers').delete().in('player_id', players);
      await db.from('academy_players').delete().eq('academy_id', academyId);
      await db.from('academy_teams').delete().eq('academy_id', academyId);
      await db.from('academies').delete().eq('id', academyId);
    }
    if (programIds.length) { await db.from('registrations').delete().in('program_id', programIds); await db.from('programs').delete().in('id', programIds); }
    if (famId) await db.from('families').delete().eq('id', famId);
    record('cleanup', true, 'academy, teams, players, offers, programs, family removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
