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
