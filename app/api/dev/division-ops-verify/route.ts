import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';
import { addRosterMember, buildLeagueSchedule, createDivision } from '@/lib/competitive/competitive';
import { coachBoard, confirmationByToken, respondToConfirmation, saveCoachQuestions, sendCoachConfirmations, setTeamCoach } from '@/lib/competitive/coachConfirmations';
import { applyDraft, latestProposal, proposeDraft } from '@/lib/competitive/draftProposals';
import { assignOfficials, emailOfficialSchedules, officialSchedules, upsertOfficial } from '@/lib/competitive/officials';
import { getMediaDay, notifyMediaDayFamilies, planMediaDay } from '@/lib/competitive/mediaDay';

/**
 * DEV-ONLY: division ops (migration 0058) end to end - draft proposals
 * (preview -> approve), coach confirmations (token round-trip, custom
 * questions, decline, coach-swap reset), officials auto-booking (window /
 * overlap / cap / coach-conflict rules), media day windows from rosters +
 * photo consent with a real M2 hold. Cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const rec = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  let programId: number | null = null;
  let divisionId: number | null = null;
  const famIds: number[] = [];
  const staffIds: number[] = [];
  const officialIds: number[] = [];

  try {
    // ---- setup: program, division, 2 families (consent split), 8 players ----
    const league = (await listProgramTypes()).find((t) => t.key === 'league')!;
    const prog = await createProgram({ name: 'DivOps Verify League', programTypeId: league.id, sportTag: 'Basketball', actorClerkId: 'dev:verify' });
    programId = prog.id;
    divisionId = await createDivision({ programId, name: 'U13 Ops', sport: 'basketball' }, 'dev:verify');

    const { data: famA } = await db.from('families').insert({ name: 'Ops Fam A', face_grouping_consent: true }).select('id').single();
    const { data: famB } = await db.from('families').insert({ name: 'Ops Fam B', face_grouping_consent: false }).select('id').single();
    famIds.push(famA!.id, famB!.id);
    const memberIds: number[] = [];
    for (let i = 0; i < 8; i++) {
      const famId = i < 4 ? famA!.id : famB!.id;
      const { data: m } = await db.from('family_members').insert({
        family_id: famId, first_name: `Ops${i}`, last_name: 'Verify', member_role: 'dependent',
        dob: `201${3 - (i % 2)}-0${(i % 8) + 1}-15`, staff_skill_rating: (i % 5) + 1,
      }).select('id').single();
      const { data: r } = await db.from('registrations').insert({ program_id: programId, family_member_id: m!.id, family_id: famId, status: 'active' }).select('id').single();
      await addRosterMember({ divisionId, registrationId: r!.id });
      const { data: tm } = await db.from('team_members').select('id').eq('registration_id', r!.id).single();
      memberIds.push(tm!.id);
    }
    await db.from('team_members').update({ group_key: 'ops-buddies' }).in('id', [memberIds[0], memberIds[1]]);

    // ---- 1. draft proposal: preview writes NO teams ----
    const proposal = await proposeDraft({ divisionId, numTeams: 2, attributes: ['skill', 'age'], actorClerkId: 'dev:verify' });
    const { data: teamsAfterPropose } = await db.from('teams').select('id').eq('division_id', divisionId);
    const placedInProposal = proposal.teams.reduce((n, t) => n + t.members.length, 0);
    rec('propose: preview only, no teams written', (teamsAfterPropose ?? []).length === 0 && placedInProposal === 8, `${placedInProposal} placed, spread ${JSON.stringify(proposal.spread)}`);
    const buddyTeam = proposal.teams.findIndex((t) => t.members.some((m) => m.memberId === memberIds[0]));
    rec('propose: together-group stays intact', proposal.teams[buddyTeam].members.some((m) => m.memberId === memberIds[1]), `both buddies in team ${buddyTeam + 1}`);

    const latest = await latestProposal(divisionId);
    rec('latestProposal returns the pending draft', latest?.proposalId === proposal.proposalId, `#${latest?.proposalId}`);

    // ---- 2. approve: teams created, roster assigned, proposal consumed ----
    await applyDraft(proposal.proposalId, 'dev:verify');
    const [{ data: teamsRows }, { data: placed }] = await Promise.all([
      db.from('teams').select('id, name').eq('division_id', divisionId).order('sort_order'),
      db.from('team_members').select('id, team_id').eq('division_id', divisionId),
    ]);
    rec('apply: 2 teams created + every player assigned', (teamsRows ?? []).length === 2 && (placed ?? []).every((p) => p.team_id != null), `${(teamsRows ?? []).length} teams`);
    rec('apply: proposal consumed', (await latestProposal(divisionId)) === null, 'no pending proposal');

    // re-propose with teams existing: apply must REUSE rows, not multiply them
    const p2 = await proposeDraft({ divisionId, numTeams: 2, attributes: ['skill'], actorClerkId: 'dev:verify' });
    await applyDraft(p2.proposalId, 'dev:verify');
    const { data: teamsAgain } = await db.from('teams').select('id').eq('division_id', divisionId);
    rec('re-apply reuses existing team rows', (teamsAgain ?? []).length === 2, `${(teamsAgain ?? []).length} teams after 2nd apply`);

    // ---- 3. coach confirmations ----
    const { data: staffA } = await db.from('staff').insert({ first_name: 'Casey', last_name: 'OpsCoach', email: `ops-coach-${Date.now()}@example.com`, status: 'active', created_by: 'dev:verify' }).select('id').single();
    const { data: staffB } = await db.from('staff').insert({ first_name: 'Robin', last_name: 'NoEmail', email: null, status: 'active', created_by: 'dev:verify' }).select('id').single();
    staffIds.push(staffA!.id, staffB!.id);
    const [teamX, teamY] = (teamsRows ?? []).map((t) => t.id);
    await setTeamCoach(teamX, staffA!.id, 'dev:verify');
    await setTeamCoach(teamY, staffB!.id, 'dev:verify');
    await saveCoachQuestions(divisionId, ['Preferred practice night?', 'Attending the coaches meeting?'], 'dev:verify');
    const sendRes = await sendCoachConfirmations(divisionId, 'dev:verify');
    rec('send: rows created; no-email coach reported not skipped', sendRes.noEmail.length === 1 && sendRes.sent === 1, `sent ${sendRes.sent}, noEmail ${sendRes.noEmail.join(',')}`);

    const board1 = await coachBoard(divisionId);
    const rowX = board1.rows.find((r) => r.teamId === teamX)!;
    const rowY = board1.rows.find((r) => r.teamId === teamY)!;
    rec('board: both teams pending with tokens', rowX.status === 'pending' && rowY.status === 'pending' && !!rowX.token && !!rowY.token, `${rowX.status}/${rowY.status}`);

    const view = await confirmationByToken(rowX.token!);
    rec('token page view resolves questions', view?.questions.length === 2 && view.teamName === 'Team 1', `${view?.questions.length} questions for ${view?.teamName}`);
    await respondToConfirmation(rowX.token!, { decision: 'confirmed', answers: { 'Preferred practice night?': 'Tuesdays', 'Attending the coaches meeting?': 'Yes' } });
    await respondToConfirmation(rowY.token!, { decision: 'declined', note: 'Out of town for the season' });
    const board2 = await coachBoard(divisionId);
    rec('confirm + decline round-trip', board2.rows.find((r) => r.teamId === teamX)?.status === 'confirmed' && board2.rows.find((r) => r.teamId === teamY)?.status === 'declined', `answers: ${JSON.stringify(board2.rows.find((r) => r.teamId === teamX)?.answers)}`);
    await setTeamCoach(teamY, staffA!.id, 'dev:verify');
    const board3 = await coachBoard(divisionId);
    rec('coach swap resets that team to not_sent', board3.rows.find((r) => r.teamId === teamY)?.status === 'not_sent', 'stale confirmation removed');
    await setTeamCoach(teamY, staffB!.id, 'dev:verify'); // restore for conflict test below

    // ---- 4. schedule + officials ----
    const facId = (await db.from('facilities').select('id').eq('name', 'Dome Court 1').single()).data!.id;
    await buildLeagueSchedule({ divisionId, facilityId: facId, startDate: '2026-09-08', weekdays: [2], timeSlots: ['18:00', '19:00'], gameMinutes: 60, numCourts: 2, actorClerkId: 'dev:verify' });
    officialIds.push(await upsertOfficial({ firstName: 'Ava', lastName: 'ConflictRef', email: 'ops-ref-a@example.com', staffId: staffA!.id }, 'dev:verify'));
    officialIds.push(await upsertOfficial({ firstName: 'Ben', lastName: 'OpenRef', email: 'ops-ref-b@example.com' }, 'dev:verify'));
    officialIds.push(await upsertOfficial({ firstName: 'Cal', lastName: 'OpenRef', email: null }, 'dev:verify'));
    officialIds.push(await upsertOfficial({ firstName: 'Dee', lastName: 'MorningRef', availStart: '06:00', availEnd: '08:00' }, 'dev:verify'));

    const report = await assignOfficials({ divisionId, perGame: 2, actorClerkId: 'dev:verify' });
    rec('officials: game fully staffed by eligible pool', report.needed === 2 && report.filled === 2 && report.unfilled.length === 0, `filled ${report.filled}/${report.needed}`);
    rec('officials: coach-conflict + window rules exclude', (report.totals[officialIds[0]] ?? 0) === 0 && (report.totals[officialIds[3]] ?? 0) === 0, `conflict ref ${report.totals[officialIds[0]]}, morning ref ${report.totals[officialIds[3]]}`);
    const { schedules } = await officialSchedules(divisionId);
    rec('condensed schedules: one block per working official', schedules.filter((s) => s.lines.length > 0).length === 2, `${schedules.length} schedules`);
    const mail = await emailOfficialSchedules(divisionId, 'dev:verify');
    rec('schedule emails attempted; no-email official listed', mail.noEmail.length === 1, `emailed ${mail.emailed}, noEmail ${mail.noEmail.join(',')}`);

    // ---- 5. media day ----
    const plan = await planMediaDay({ divisionId, facilityId: facId, day: '2026-09-12', startHHMM: '09:00', teamPhotoMinutes: 10, portraitMinutes: 2, bufferMinutes: 10, includePortraits: true, includeCoach: true, actorClerkId: 'dev:verify' });
    const totalConsented = plan.windows.reduce((n, w) => n + w.consented, 0);
    const totalNoConsent = plan.windows.reduce((n, w) => n + w.noConsent.length, 0);
    rec('media day: windows sized from roster + consent', plan.windows.length === 2 && totalConsented === 4 && totalNoConsent === 4, `${totalConsented} portraits, ${totalNoConsent} team-photo-only`);
    rec('media day: real M2 hold booked', plan.bookingId != null && plan.wrapHHMM > plan.startHHMM, `hold ${plan.startHHMM}-${plan.wrapHHMM}, booking ${plan.bookingId}`);
    const firstBookingId = plan.bookingId;
    const plan2 = await planMediaDay({ divisionId, facilityId: facId, day: '2026-09-13', startHHMM: '10:00', teamPhotoMinutes: 5, portraitMinutes: 1, bufferMinutes: 5, includePortraits: false, includeCoach: false, actorClerkId: 'dev:verify' });
    const { data: oldBooking } = await db.from('bookings').select('canceled_at').eq('id', firstBookingId!).single();
    rec('replan: same row, old hold cancelled, new hold booked', plan2.id === plan.id && !!oldBooking?.canceled_at && plan2.bookingId !== firstBookingId, `row #${plan2.id}`);
    const notif = await notifyMediaDayFamilies(divisionId, 'dev:verify');
    const after = await getMediaDay(divisionId);
    rec('notify: families resolved, notified_at stamped', notif.emailed + notif.skipped > 0 && !!after?.notifiedAt, `emailed ${notif.emailed}, skipped ${notif.skipped} (no HoH profile on temp fams)`);
  } catch (err) {
    rec('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (divisionId) {
      const { data: games } = await db.from('games').select('id, booking_id').eq('division_id', divisionId);
      const gameIds = (games ?? []).map((g) => g.id);
      if (gameIds.length) await db.from('game_officials').delete().in('game_id', gameIds);
      const bIds = (games ?? []).map((g) => g.booking_id).filter(Boolean) as number[];
      await db.from('games').delete().eq('division_id', divisionId);
      if (bIds.length) await db.from('bookings').delete().in('id', bIds);
      const { data: md } = await db.from('media_days').select('booking_id').eq('division_id', divisionId).maybeSingle();
      await db.from('media_days').delete().eq('division_id', divisionId);
      if (md?.booking_id) await db.from('bookings').delete().eq('id', md.booking_id);
      await db.from('bookings').delete().like('source_ref', 'media-day:%').eq('created_by', 'dev:verify');
      await db.from('coach_confirmations').delete().eq('division_id', divisionId);
      await db.from('ai_proposals').delete().eq('target_ref', `division:${divisionId}`);
      await db.from('team_members').delete().eq('division_id', divisionId);
      await db.from('teams').delete().eq('division_id', divisionId);
      await db.from('divisions').delete().eq('id', divisionId);
    }
    if (officialIds.length) await db.from('officials').delete().in('id', officialIds);
    if (programId) { await db.from('registrations').delete().eq('program_id', programId); await db.from('programs').delete().eq('id', programId); }
    for (const famId of famIds) { await db.from('family_members').delete().eq('family_id', famId); await db.from('families').delete().eq('id', famId); }
    if (staffIds.length) await db.from('staff').delete().in('id', staffIds);
    rec('cleanup', true, 'division, program, families, staff, officials removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
