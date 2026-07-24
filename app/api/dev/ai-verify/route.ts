import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';
import { createDivision } from '@/lib/competitive/competitive';
import {
  bestSendHour, draftProgramDescription, generateHighlights, highlightWindows, mediaForPlayer,
  optimizeSlots, pricingInsights, proposeRoster, slotFairness, type SlotAssignment,
} from '@/lib/ai/enhancements';

/**
 * DEV-ONLY: Module 22 - description draft from real fields, roster PROPOSAL
 * (never writes teams), schedule optimization improves fairness (never
 * publishes), face-grouping consent gate + jersey fallback, highlight windows
 * from score timestamps (merge), own-data pricing heuristics, nudge best-hour.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const programIds: number[] = [];
  let famId: number | null = null;
  let divisionId: number | null = null;
  let galleryId: number | null = null;
  let gameId: number | null = null;
  const proposalIds: number[] = [];

  try {
    const league = (await listProgramTypes()).find((t) => t.key === 'league')!;
    const prog = await createProgram({ name: 'AI U12 Soccer League', programTypeId: league.id, actorClerkId: 'system:verify' });
    programIds.push(prog.id);
    await db.from('programs').update({ status: 'registration_open', min_age: 10, max_age: 12, season_key: '2026:may-aug', capacity: 2 }).eq('id', prog.id);

    // 1. description draft from structured fields (fallback path, no invention)
    const draft = await draftProgramDescription(prog.id, 'system:verify');
    record('description drafted from real fields', draft.draft.includes('AI U12 Soccer League') && draft.draft.length > 40, `${draft.source}: ${draft.draft.slice(0, 70)}`);

    // 2. roster proposal: stored as proposal, NEVER writes teams
    divisionId = await createDivision({ programId: prog.id, name: 'AI Div', sport: 'other' }, 'system:verify');
    await db.from('team_members').insert(Array.from({ length: 8 }, () => ({ division_id: divisionId })));
    const { count: teamsBefore } = await db.from('teams').select('id', { count: 'exact', head: true }).eq('division_id', divisionId);
    const roster = await proposeRoster(divisionId, 2, 'system:verify');
    proposalIds.push(roster.proposalId);
    const { count: teamsAfter } = await db.from('teams').select('id', { count: 'exact', head: true }).eq('division_id', divisionId);
    const { data: prop } = await db.from('ai_proposals').select('status, proposal').eq('id', roster.proposalId).single();
    record('roster: proposal stored, NO teams written (staff approve)', teamsBefore === teamsAfter && prop!.status === 'proposed' && (prop!.proposal as { teams: number[][] }).teams.length === 2, `teams ${teamsBefore}->${teamsAfter}, status ${prop!.status}`);

    // 3. schedule optimization improves fairness, publishes nothing
    const skewed: SlotAssignment[] = [
      { gameIndex: 0, timeSlot: '18:00', court: 0, teams: [1, 2] },
      { gameIndex: 1, timeSlot: '18:00', court: 1, teams: [1, 3] },
      { gameIndex: 2, timeSlot: '18:00', court: 0, teams: [1, 4] },
      { gameIndex: 3, timeSlot: '20:00', court: 0, teams: [2, 3] },
      { gameIndex: 4, timeSlot: '20:00', court: 1, teams: [2, 4] },
      { gameIndex: 5, timeSlot: '20:00', court: 0, teams: [3, 4] },
    ];
    const slots = ['18:00', '19:00', '20:00'];
    const opt = optimizeSlots(skewed, slots);
    record('schedule pass improves time-slot fairness (proposal only)', opt.after <= opt.before && slotFairness(opt.optimized, slots) === opt.after, `${opt.before} -> ${opt.after}`);

    // 4. auto-gallery: consent gate + jersey fallback
    const { data: fam } = await db.from('families').insert({ name: 'AI Fam' }).select('id').single();
    famId = fam!.id;
    const { data: gal } = await db.from('galleries').insert({ program_id: prog.id, title: 'AI Gallery' }).select('id').single();
    galleryId = gal!.id;
    await db.from('gallery_media').insert([
      { gallery_id: galleryId, kind: 'photo', storage_path: 'x/1.png', jersey_numbers: [7, 12] },
      { gallery_id: galleryId, kind: 'photo', storage_path: 'x/2.png', jersey_numbers: [12] },
      { gallery_id: galleryId, kind: 'photo', storage_path: 'x/3.png', jersey_numbers: [9] },
    ]);
    const jersey = await mediaForPlayer(galleryId!, famId!, 12, 'jersey');
    record('jersey-number grouping (default, non-biometric)', jersey.mediaIds.length === 2 && !jersey.refused, `${jersey.mediaIds.length} matches`);
    const faceNoConsent = await mediaForPlayer(galleryId!, famId!, 12, 'face');
    record('face grouping HARD-GATED on consent + jersey fallback', !!faceNoConsent.refused && faceNoConsent.mediaIds.length === 2, faceNoConsent.refused ?? '');
    await db.from('families').update({ face_grouping_consent: true }).eq('id', famId);
    const faceConsented = await mediaForPlayer(galleryId!, famId!, 12, 'face');
    record('consented face path allowed', !faceConsented.refused && faceConsented.method === 'face', faceConsented.method);

    // 5. highlight windows: pad + merge overlapping, per-player attribution
    const t0 = Date.parse('2026-07-20T19:00:00Z');
    const windows = highlightWindows([
      { occurredAt: new Date(t0).toISOString(), playerNumber: 12 },
      { occurredAt: new Date(t0 + 8000).toISOString(), playerNumber: 12 },  // overlaps -> merge
      { occurredAt: new Date(t0 + 60000).toISOString(), playerNumber: 9 },
      { occurredAt: new Date(t0 + 120000).toISOString() },                   // team moment
    ]);
    record('highlight windows: overlap merged per player', windows.length === 3 && windows[0].playerNumber === 12 && (Date.parse(windows[0].endsAt) - Date.parse(windows[0].startsAt)) === 23000, `${windows.length} clips, first ${(Date.parse(windows[0].endsAt) - Date.parse(windows[0].startsAt)) / 1000}s`);

    // persist path from real score events
    const { data: game } = await db.from('games').insert({ division_id: divisionId, round: 1, starts_at: new Date(t0).toISOString(), status: 'final', home_score: 4, away_score: 2 }).select('id').single();
    gameId = game!.id;
    await db.from('score_events').insert([
      { game_id: gameId, player_number: 12, points: 2, occurred_at: new Date(t0).toISOString() },
      { game_id: gameId, player_number: 9, points: 2, occurred_at: new Date(t0 + 60000).toISOString() },
    ]);
    const gen = await generateHighlights(gameId!, { galleryId });
    record('highlights persisted from score events (per-player reels)', gen.clips === 2 && gen.perPlayer['12'] === 1 && gen.perPlayer['9'] === 1, JSON.stringify(gen.perPlayer));

    // 6. pricing insights: own-data heuristics only (full-with-waitlist fires)
    const { data: mem } = await db.from('family_members').insert({ family_id: famId, first_name: 'A', last_name: 'I', member_role: 'dependent' }).select('id').single();
    const { data: mem2 } = await db.from('family_members').insert({ family_id: famId, first_name: 'B', last_name: 'I', member_role: 'dependent' }).select('id').single();
    const { data: mem3 } = await db.from('family_members').insert({ family_id: famId, first_name: 'C', last_name: 'I', member_role: 'dependent' }).select('id').single();
    await db.from('registrations').insert([
      { program_id: prog.id, family_id: famId, family_member_id: mem!.id, status: 'active', standing: 'brand_new' },
      { program_id: prog.id, family_id: famId, family_member_id: mem2!.id, status: 'active', standing: 'brand_new' },
      { program_id: prog.id, family_id: famId, family_member_id: mem3!.id, status: 'waitlisted', standing: 'brand_new' },
    ]);
    const pricing = await pricingInsights();
    const mine = pricing.insights.find((i) => i.programId === prog.id);
    record('pricing heuristic: full-with-waitlist -> headroom (own data only)', mine?.signal === 'full_with_waitlist' && mine.insight.includes('waitlisted'), mine?.insight ?? 'none');

    // 7. nudge best-hour math
    const opens = ['2026-07-01T22:15:00Z', '2026-07-03T22:40:00Z', '2026-07-05T23:05:00Z', '2026-07-06T11:00:00Z']; // 22-23 UTC = 18-19 Toronto (EDT)
    const hour = bestSendHour(opens);
    record('nudge best send hour from open history (Toronto)', hour === 18, `${hour}:00`);
    record('nudge fallback without history', bestSendHour([]) === 18, `${bestSendHour([])}`);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (gameId) { await db.from('highlight_clips').delete().eq('game_id', gameId); await db.from('score_events').delete().eq('game_id', gameId); await db.from('games').delete().eq('id', gameId); }
    if (galleryId) { await db.from('gallery_media').delete().eq('gallery_id', galleryId); await db.from('galleries').delete().eq('id', galleryId); }
    if (proposalIds.length) await db.from('ai_proposals').delete().in('id', proposalIds);
    if (divisionId) { await db.from('team_members').delete().eq('division_id', divisionId); await db.from('teams').delete().eq('division_id', divisionId); await db.from('divisions').delete().eq('id', divisionId); }
    if (programIds.length) { await db.from('registrations').delete().in('program_id', programIds); await db.from('programs').delete().in('id', programIds); }
    if (famId) { await db.from('family_members').delete().eq('family_id', famId); await db.from('families').delete().eq('id', famId); }
    record('cleanup', true, 'proposals, clips, gallery, division, programs, family removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
