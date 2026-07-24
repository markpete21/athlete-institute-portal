import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';
import {
  addTryoutSession, bulkSendOffers, cancelOffer, confirmedRosterHandoff, createClub, createTeam,
  depositForOffer, dobEligible, evaluationSheet, getOfferByToken, respondToOffer, sendOffer, setFlag, syncTryoutRoster,
} from '@/lib/club/club';

/**
 * DEV-ONLY: Module 11 - Club->Team, per-team DOB eligibility, tryout
 * level+gender consolidation, the full flag ladder, verbal + deposit offers
 * (deposit applied to season fee), accept/deny, manual cancel. Cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  let clubId: number | null = null;
  let famId: number | null = null;
  const programIds: number[] = [];

  try {
    const club = (await listProgramTypes()).find((t) => t.key === 'club')!;
    clubId = await createClub({ name: 'Bears Volleyball Club', sport: 'volleyball' }, 'system:verify');

    // 1. Club -> Team with free-text level + per-team DOB window + season fee.
    const seasonProg = await createProgram({ name: '15U Girls Season', programTypeId: club.id, actorClerkId: 'system:verify' });
    programIds.push(seasonProg.id);
    const teamId = await createTeam({ clubId, name: '15U Girls', levelLabel: '15U', gender: 'girls', dobMin: '2010-01-01', dobMax: '2011-12-31', seasonFeeCents: 120000, seasonProgramId: seasonProg.id }, 'system:verify');
    record('club -> team with free-text level + season fee', teamId > 0, `team ${teamId}`);

    // 2. per-team DOB eligibility (window is the rule, not the label)
    const team = { dob_min: '2010-01-01', dob_max: '2011-12-31' };
    record('per-team DOB eligibility', dobEligible('2010-06-01', team) && !dobEligible('2009-12-31', team) && !dobEligible('2012-01-05', team), 'in/under/over');

    // 3. two tryout SESSIONS for the same level+gender consolidate into ONE roster
    const fam = (await db.from('families').insert({ name: 'Bears Fam' }).select('id').single()).data!;
    famId = fam.id;
    const mem = async (n: string, dob: string) => (await db.from('family_members').insert({ family_id: fam.id, first_name: n, last_name: 'K', member_role: 'dependent', dob }).select('id').single()).data!.id;
    const kids = { a: await mem('A', '2010-03-01'), b: await mem('B', '2010-08-01'), c: await mem('C', '2011-02-01') };

    const t1 = await createProgram({ name: '15U Girls Tryout - Session 1', programTypeId: club.id, actorClerkId: 'system:verify' });
    const t2 = await createProgram({ name: '15U Girls Tryout - Session 2', programTypeId: club.id, actorClerkId: 'system:verify' });
    programIds.push(t1.id, t2.id);
    for (const p of [t1.id, t2.id]) await db.from('programs').update({ status: 'registration_open' }).eq('id', p);
    await addTryoutSession({ clubId, programId: t1.id, levelLabel: '15U', gender: 'girls' }, 'system:verify');
    await addTryoutSession({ clubId, programId: t2.id, levelLabel: '15U', gender: 'girls' }, 'system:verify');
    // A attends BOTH sessions; B session 1; C session 2.
    await db.from('registrations').insert([
      { program_id: t1.id, family_member_id: kids.a, family_id: fam.id, status: 'active', standing: 'brand_new' },
      { program_id: t2.id, family_member_id: kids.a, family_id: fam.id, status: 'active', standing: 'brand_new' },
      { program_id: t1.id, family_member_id: kids.b, family_id: fam.id, status: 'active', standing: 'brand_new' },
      { program_id: t2.id, family_member_id: kids.c, family_id: fam.id, status: 'active', standing: 'brand_new' },
    ]);
    await syncTryoutRoster(clubId, '15U', 'girls');
    const roster = await evaluationSheet(clubId, '15U', 'girls');
    record('level+gender consolidation (A in 2 sessions = 1 row)', roster.length === 3 && roster.every((r, i) => r.number === i + 1), `${roster.length} players, numbered`);

    // 4. flag ladder: unrated -> selected -> onto team
    const pa = roster.find((r) => r.name === 'A K')!.playerId;
    const pb = roster.find((r) => r.name === 'B K')!.playerId;
    const pc = roster.find((r) => r.name === 'C K')!.playerId;
    await setFlag(pa, 'selected', 'system:verify', teamId);
    await setFlag(pb, 'selected', 'system:verify', teamId);
    await setFlag(pc, 'considering', 'system:verify');
    const { data: paRow } = await db.from('club_tryout_players').select('flag, team_id').eq('id', pa).single();
    record('flag Selected moves player onto team roster', paRow!.flag === 'selected' && paRow!.team_id === teamId, JSON.stringify(paRow));

    // 5a. VERBAL offer -> accept with no payment -> confirmed, season registration created
    const verbal = await sendOffer({ playerId: pa, teamId, mode: 'verbal' }, 'system:verify');
    const { data: afterOffer } = await db.from('club_tryout_players').select('flag').eq('id', pa).single();
    const verbalRes = await respondToOffer(verbal.token, true, 'system:verify');
    record('verbal offer: pending -> confirmed, season reg created, $0 deposit', afterOffer!.flag === 'offered_pending' && verbalRes.flag === 'confirmed' && verbalRes.depositAppliedCents === 0 && !!verbalRes.seasonRegistrationId, JSON.stringify({ deposit: verbalRes.depositAppliedCents, reg: verbalRes.seasonRegistrationId }));

    // 5b. DEPOSIT offer (25% of $1200 = $300) -> applied to season fee, remaining $900
    const dep = await sendOffer({ playerId: pb, teamId, mode: 'deposit', depositPct: 25 }, 'system:verify');
    const view = await getOfferByToken(dep.token);
    const depRes = await respondToOffer(dep.token, true, 'system:verify');
    record('deposit offer: 25% applied to season fee, remaining correct', view!.depositCents === 30000 && depRes.depositAppliedCents === 30000 && depRes.remainingCents === 90000, JSON.stringify({ deposit: depRes.depositAppliedCents, remaining: depRes.remainingCents }));

    // 5c. deposit set-amount helper
    record('deposit set-amount vs percent', depositForOffer({ mode: 'deposit', deposit_cents: 25000, deposit_pct: null }, 120000) === 25000 && depositForOffer({ mode: 'deposit', deposit_cents: null, deposit_pct: 10 }, 120000) === 12000, 'both');

    // 6. deny path + manual cancel
    const denyOffer = await sendOffer({ playerId: pc, teamId, mode: 'verbal' }, 'system:verify');
    const denyRes = await respondToOffer(denyOffer.token, false, 'system:verify');
    const { data: pcRow } = await db.from('club_tryout_players').select('flag').eq('id', pc).single();
    record('deny -> Declined', denyRes.flag === 'declined' && pcRow!.flag === 'declined', pcRow!.flag);

    // bulk offer + cancel returns player to Selected
    await setFlag(pc, 'selected', 'system:verify', teamId);
    const bulk = await bulkSendOffers([pc], teamId, { mode: 'verbal' }, 'system:verify');
    await cancelOffer(bulk[0].offerId, 'system:verify');
    const { data: pcAfterCancel } = await db.from('club_tryout_players').select('flag').eq('id', pc).single();
    record('bulk offer + manual cancel returns player to Selected', pcAfterCancel!.flag === 'selected', pcAfterCancel!.flag);

    // 7. confirmed-roster handoff hook (to the separate club app)
    const handoff = await confirmedRosterHandoff(teamId);
    record('confirmed-roster handoff hook', handoff.players.length === 2 && handoff.teamId === teamId, `${handoff.players.length} confirmed`);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (clubId) {
      const players = (await db.from('club_tryout_players').select('id').eq('club_id', clubId)).data?.map((r) => r.id) ?? [];
      if (players.length) await db.from('club_offers').delete().in('player_id', players);
      await db.from('club_tryout_players').delete().eq('club_id', clubId);
      await db.from('club_tryout_sessions').delete().eq('club_id', clubId);
      await db.from('club_teams').delete().eq('club_id', clubId);
      await db.from('clubs').delete().eq('id', clubId);
    }
    if (programIds.length) { await db.from('registrations').delete().in('program_id', programIds); await db.from('programs').delete().in('id', programIds); }
    if (famId) await db.from('families').delete().eq('id', famId);
    record('cleanup', true, 'club, teams, roster, offers, programs, family removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
