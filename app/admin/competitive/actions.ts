'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { audit, type BalanceAttribute, type Sport } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { getPortalSession } from '@/lib/auth';
import { profileCan } from '@/lib/staff/staff';
import { buildLeagueSchedule, createDivision, generatePlayoffRound, runTeamBuilder, saveScore, setSkillRating, updateTiebreaks } from '@/lib/competitive/competitive';

async function requireStaff() {
  const session = await getPortalSession();
  if (!session.isStaff) throw new Error('Staff only.');
  return session;
}

export async function createDivisionAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = await createDivision({
    programId: Number(formData.get('programId')),
    name: String(formData.get('name') ?? '').trim() || 'Division',
    sport: String(formData.get('sport') ?? 'other') as Sport,
    maxTeams: formData.get('maxTeams') ? Number(formData.get('maxTeams')) : null,
    minPlayers: formData.get('minPlayers') ? Number(formData.get('minPlayers')) : null,
    maxPlayers: formData.get('maxPlayers') ? Number(formData.get('maxPlayers')) : null,
  }, session.userId!);
  redirect(`/competitive/${id}`);
}

export async function runBuilderAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const divisionId = Number(formData.get('divisionId'));
  const attributes = formData.getAll('attributes').map(String) as BalanceAttribute[];
  await runTeamBuilder({ divisionId, numTeams: Number(formData.get('numTeams')) || 2, attributes, actorClerkId: session.userId! });
  revalidatePath(`/competitive/${divisionId}`);
}

export async function buildScheduleAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const divisionId = Number(formData.get('divisionId'));
  await buildLeagueSchedule({
    divisionId,
    facilityId: Number(formData.get('facilityId')),
    startDate: String(formData.get('startDate')),
    weekdays: formData.getAll('weekday').map(Number),
    timeSlots: String(formData.get('timeSlots') ?? '18:00,19:00,20:00').split(',').map((s) => s.trim()).filter(Boolean),
    gameMinutes: Number(formData.get('gameMinutes')) || 60,
    numCourts: Number(formData.get('numCourts')) || 1,
    doubleRound: formData.get('doubleRound') === 'on',
    actorClerkId: session.userId!,
  });
  revalidatePath(`/competitive/${divisionId}`);
}

export async function saveScoreAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  // Score entry gated by the Module 5 capability matrix (convenor/coach on-site).
  if (session.profileId && !(await profileCan(session.profileId, 'score_entry', 'edit'))) {
    throw new Error('You do not have the score-entry capability.');
  }
  const divisionId = Number(formData.get('divisionId'));
  await saveScore({
    gameId: Number(formData.get('gameId')),
    homeScore: Number(formData.get('homeScore')),
    awayScore: Number(formData.get('awayScore')),
    overtime: formData.get('overtime') === 'on',
    liveStreamRef: String(formData.get('liveStreamRef') ?? '').trim() || null,
    actorClerkId: session.userId!,
  });
  revalidatePath(`/competitive/${divisionId}`);
}

/**
 * Staff-only 1-5 skill rating on the athlete. Never public; powers the team
 * builder. Any staff can set it (it's an operational note, not a sensitive
 * roster field like medical info).
 */
export async function setSkillRatingAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const raw = String(formData.get('rating') ?? '');
  await setSkillRating(
    Number(formData.get('familyMemberId')),
    raw === '' ? null : Number(raw),
    session.userId!,
  );
  revalidatePath(`/competitive/${Number(formData.get('divisionId'))}`);
}

/** Standings hierarchy: ordered tiebreak criteria from the ranked selects. */
export async function saveTiebreaksAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const divisionId = Number(formData.get('divisionId'));
  const ordered = [1, 2, 3, 4, 5]
    .map((i) => String(formData.get(`tb${i}`) ?? ''))
    .filter(Boolean);
  await updateTiebreaks(divisionId, ordered, session.userId!);
  revalidatePath(`/competitive/${divisionId}`);
}

/** Seed round 1 from standings, or advance winners into the next round. */
export async function generatePlayoffsAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const divisionId = Number(formData.get('divisionId'));
  await generatePlayoffRound(divisionId, Number(formData.get('numTeams')) || 4, session.userId!);
  revalidatePath(`/competitive/${divisionId}`);
}

/**
 * Compete. Portal visibility for a division: whether it appears on the public
 * site at all, and whether public rosters show full names or "Ava P.".
 * Defaults are set at creation by program type (leagues/clinics -> MASKED;
 * tournaments/rep -> full names; Academy -> never public) and overridden here.
 */
export async function saveCompeteSettingsAction(formData: FormData): Promise<void> {
  const s = await getPortalSession();
  if (!s.isStaff) throw new Error('Staff only.');
  const divisionId = Number(formData.get('divisionId'));
  const { error } = await supabaseAdmin()
    .from('divisions')
    .update({
      show_on_compete: formData.get('showOnCompete') === 'on',
      show_full_names: formData.get('showFullNames') === 'on',
    })
    .eq('id', divisionId);
  if (error) throw new Error(error.message);
  await audit({
    actorId: s.userId!,
    action: 'division.compete-settings',
    target: `division:${divisionId}`,
    meta: { showOnCompete: formData.get('showOnCompete') === 'on', showFullNames: formData.get('showFullNames') === 'on' },
  });
  revalidatePath(`/competitive/${divisionId}`);
}

/**
 * Stats platform per division (slice 2): master switch + which boards the
 * public Stats tab shows. Default OFF — flipping it on is what makes player
 * profiles and the Stats tab exist at all.
 */
export async function saveStatsSettingsAction(formData: FormData): Promise<void> {
  const s = await getPortalSession();
  if (!s.isStaff) throw new Error('Staff only.');
  const divisionId = Number(formData.get('divisionId'));
  const show = {
    averages: formData.get('showAverages') === 'on',
    leaders: formData.get('showLeaders') === 'on',
    team: formData.get('showTeam') === 'on',
  };
  const enabled = formData.get('statsEnabled') === 'on';
  const { error } = await supabaseAdmin()
    .from('divisions')
    .update({ stats_enabled: enabled, stats_show: show })
    .eq('id', divisionId);
  if (error) throw new Error(error.message);
  await audit({
    actorId: s.userId!,
    action: 'division.stats-settings',
    target: `division:${divisionId}`,
    meta: { enabled, ...show },
  });
  revalidatePath(`/competitive/${divisionId}`);
}

/**
 * Per-game box score: one line per rostered player, keyed on the roster row
 * (team_members.id) so identity follows the registration -> family member.
 * A row left fully blank deletes any existing line; a typed 0 is a real stat.
 * Same capability gate as score entry.
 */
export async function saveBoxScoreAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  if (session.profileId && !(await profileCan(session.profileId, 'score_entry', 'edit'))) {
    throw new Error('You do not have the score-entry capability.');
  }
  const divisionId = Number(formData.get('divisionId'));
  const gameId = Number(formData.get('gameId'));
  const db = supabaseAdmin();

  const { data: members } = await db
    .from('team_members')
    .select('id, team_id')
    .eq('division_id', divisionId);
  const teamOf = new Map((members ?? []).map((m) => [m.id, m.team_id]));

  const rows = new Map<number, { pts: string; reb: string; ast: string }>();
  for (const [key, value] of formData.entries()) {
    const m = /^(pts|reb|ast)_(\d+)$/.exec(key);
    if (!m) continue;
    const mid = Number(m[2]);
    const row = rows.get(mid) ?? { pts: '', reb: '', ast: '' };
    row[m[1] as 'pts' | 'reb' | 'ast'] = String(value).trim();
    rows.set(mid, row);
  }

  const upserts: Array<{ game_id: number; division_id: number; team_id: number | null; team_member_id: number; pts: number; reb: number; ast: number }> = [];
  const deletes: number[] = [];
  for (const [mid, r] of rows) {
    if (r.pts === '' && r.reb === '' && r.ast === '') { deletes.push(mid); continue; }
    upserts.push({
      game_id: gameId,
      division_id: divisionId,
      team_id: teamOf.get(mid) ?? null,
      team_member_id: mid,
      pts: Math.max(0, Number(r.pts) || 0),
      reb: Math.max(0, Number(r.reb) || 0),
      ast: Math.max(0, Number(r.ast) || 0),
    });
  }
  if (upserts.length) {
    const { error } = await db.from('game_stat_lines').upsert(upserts, { onConflict: 'game_id,team_member_id' });
    if (error) throw new Error(error.message);
  }
  if (deletes.length) {
    const { error } = await db.from('game_stat_lines').delete().eq('game_id', gameId).in('team_member_id', deletes);
    if (error) throw new Error(error.message);
  }
  await audit({
    actorId: session.userId!,
    action: 'game.box-score',
    target: `game:${gameId}`,
    meta: { divisionId, saved: upserts.length, cleared: deletes.length },
  });
  revalidatePath(`/competitive/${divisionId}`);
}

/** Standalone Compete event: exists only on the public competitive site —
 *  no Play registration behind it. Lands on the program page for branding. */
export async function createStandaloneEventAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const { createStandaloneEvent } = await import('@/lib/competitive/competitive');
  const id = await createStandaloneEvent(
    {
      name: String(formData.get('name') ?? '').trim() || 'Untitled event',
      kind: formData.get('kind') === 'tournament' ? 'tournament' : 'league',
      seasonKey: String(formData.get('seasonKey') ?? '').trim() || null,
      brandKey: String(formData.get('brandKey') ?? 'athlete-institute'),
    },
    session.userId!,
  );
  redirect(`/programs/${id}`);
}

export async function duplicateStandaloneEventAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const { duplicateStandaloneEvent } = await import('@/lib/competitive/competitive');
  await duplicateStandaloneEvent(Number(formData.get('programId')), session.userId!);
  revalidatePath('/competitive');
}

/* ------------------------------------------------------------------ */
/* Division ops (migration 0058): coaches, draft proposals, officials, */
/* media day. Thin wrappers - the logic lives in lib/competitive/*.    */
/* ------------------------------------------------------------------ */

export async function setTeamCoachAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const { setTeamCoach } = await import('@/lib/competitive/coachConfirmations');
  const raw = String(formData.get('staffId') ?? '');
  await setTeamCoach(Number(formData.get('teamId')), raw ? Number(raw) : null, session.userId!);
  revalidatePath(`/competitive/${Number(formData.get('divisionId'))}`);
}

export async function saveCoachQuestionsAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const { saveCoachQuestions } = await import('@/lib/competitive/coachConfirmations');
  const divisionId = Number(formData.get('divisionId'));
  const questions = String(formData.get('questions') ?? '').split('\n');
  await saveCoachQuestions(divisionId, questions, session.userId!);
  revalidatePath(`/competitive/${divisionId}`);
}

export async function sendCoachConfirmsAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const { sendCoachConfirmations } = await import('@/lib/competitive/coachConfirmations');
  const divisionId = Number(formData.get('divisionId'));
  await sendCoachConfirmations(divisionId, session.userId!);
  revalidatePath(`/competitive/${divisionId}`);
}

export async function remindCoachesAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const { remindPendingCoaches } = await import('@/lib/competitive/coachConfirmations');
  const divisionId = Number(formData.get('divisionId'));
  await remindPendingCoaches(divisionId, session.userId!);
  revalidatePath(`/competitive/${divisionId}`);
}

/** Preview draft: writes an ai_proposals row, never teams. Approve applies it. */
export async function proposeDraftAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const { proposeDraft } = await import('@/lib/competitive/draftProposals');
  const divisionId = Number(formData.get('divisionId'));
  const attributes = formData.getAll('attributes').map(String) as BalanceAttribute[];
  await proposeDraft({ divisionId, numTeams: Number(formData.get('numTeams')) || 2, attributes, actorClerkId: session.userId! });
  revalidatePath(`/competitive/${divisionId}`);
}

export async function applyDraftAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const { applyDraft } = await import('@/lib/competitive/draftProposals');
  const { divisionId } = await applyDraft(Number(formData.get('proposalId')), session.userId!);
  revalidatePath(`/competitive/${divisionId}`);
}

export async function discardDraftAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const { discardProposal } = await import('@/lib/competitive/draftProposals');
  await discardProposal(Number(formData.get('proposalId')), session.userId!);
  revalidatePath(`/competitive/${Number(formData.get('divisionId'))}`);
}

export async function upsertOfficialAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const { upsertOfficial } = await import('@/lib/competitive/officials');
  const idRaw = String(formData.get('officialId') ?? '');
  const staffRaw = String(formData.get('staffId') ?? '');
  await upsertOfficial({
    id: idRaw ? Number(idRaw) : null,
    firstName: String(formData.get('firstName') ?? ''),
    lastName: String(formData.get('lastName') ?? ''),
    email: String(formData.get('email') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    availStart: String(formData.get('availStart') ?? '') || null,
    availEnd: String(formData.get('availEnd') ?? '') || null,
    maxPerDay: Number(formData.get('maxPerDay')) || 4,
    payCents: Math.round((Number(formData.get('payDollars')) || 35) * 100),
    staffId: staffRaw ? Number(staffRaw) : null,
    notes: String(formData.get('notes') ?? ''),
    active: formData.get('active') !== 'off' && formData.get('active') !== '0',
  }, session.userId!);
  revalidatePath('/competitive/officials');
}

export async function toggleOfficialAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const { error } = await supabaseAdmin()
    .from('officials')
    .update({ active: formData.get('active') === 'on' })
    .eq('id', Number(formData.get('officialId')));
  if (error) throw new Error(error.message);
  await audit({ actorId: session.userId!, action: 'official.toggled', target: `official:${Number(formData.get('officialId'))}` });
  revalidatePath('/competitive/officials');
}

export async function bookOfficialsAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const { assignOfficials } = await import('@/lib/competitive/officials');
  const divisionId = Number(formData.get('divisionId'));
  await assignOfficials({ divisionId, perGame: Number(formData.get('perGame')) || 2, actorClerkId: session.userId! });
  revalidatePath(`/competitive/${divisionId}`);
  revalidatePath(`/competitive/${divisionId}/officials`);
}

export async function emailOfficialSchedulesAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const { emailOfficialSchedules } = await import('@/lib/competitive/officials');
  const divisionId = Number(formData.get('divisionId'));
  await emailOfficialSchedules(divisionId, session.userId!);
  revalidatePath(`/competitive/${divisionId}/officials`);
}

export async function planMediaDayAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const { planMediaDay } = await import('@/lib/competitive/mediaDay');
  const divisionId = Number(formData.get('divisionId'));
  await planMediaDay({
    divisionId,
    facilityId: Number(formData.get('facilityId')),
    day: String(formData.get('day')),
    startHHMM: String(formData.get('startTime') ?? '09:00'),
    teamPhotoMinutes: Number(formData.get('teamPhotoMinutes')) || 10,
    portraitMinutes: Number(formData.get('portraitMinutes')) || 2,
    bufferMinutes: Number(formData.get('bufferMinutes')) || 10,
    includePortraits: formData.get('includePortraits') === 'on',
    includeCoach: formData.get('includeCoach') === 'on',
    actorClerkId: session.userId!,
  });
  revalidatePath(`/competitive/${divisionId}/media-day`);
}

export async function notifyMediaDayAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const { notifyMediaDayFamilies } = await import('@/lib/competitive/mediaDay');
  const divisionId = Number(formData.get('divisionId'));
  await notifyMediaDayFamilies(divisionId, session.userId!);
  revalidatePath(`/competitive/${divisionId}/media-day`);
}

/** Per-location Compete display settings (migration 0057): layout mode +
 *  welcome banner. Auto renders simple under 8 published divisions. */
export async function saveLocationDisplayAction(formData: FormData): Promise<void> {
  const s = await getPortalSession();
  if (!s.isStaff) throw new Error('Staff only.');
  const locationId = Number(formData.get('locationId'));
  const layout = String(formData.get('layoutMode') ?? 'auto');
  const welcome = String(formData.get('welcome') ?? '').trim() || null;
  const { error } = await supabaseAdmin()
    .from('compete_location_settings')
    .upsert({ location_id: locationId, layout_mode: layout, welcome }, { onConflict: 'location_id' });
  if (error) throw new Error(error.message);
  await audit({ actorId: s.userId!, action: 'compete.location-display', target: `location:${locationId}`, meta: { layout, hasWelcome: !!welcome } });
  revalidatePath('/competitive');
}
