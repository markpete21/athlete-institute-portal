import 'server-only';
import { audit, balanceDraft, type BalanceAttribute, type DraftPlayer } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Draft proposals: the preview-then-approve team builder flow.
 *
 * proposeDraft() runs the balancing engine and writes an ai_proposals row -
 * it NEVER touches teams. Staff see the full rosters + per-attribute balance
 * before anything is saved; applyDraft() is the only writer. This replaces
 * the old one-click runTeamBuilder flow (which created teams sight-unseen and
 * discarded the balance report).
 *
 * Attribute sources: skill = family_members.staff_skill_rating (falls back to
 * nothing - unrated players draft on roster-size balance alone), age =
 * family_members.dob. gender/height/experience come from registration
 * question answers when a question map is provided (not wired in the UI yet).
 */

export interface ProposalTeam {
  name: string;
  members: { memberId: number; name: string; rating: number | null }[];
  avgSkill: number | null;
}

export interface DraftProposal {
  proposalId: number;
  numTeams: number;
  attributes: BalanceAttribute[];
  teams: ProposalTeam[];
  spread: Record<string, number>;
  createdAt: string;
}

interface MemberInfo {
  memberId: number;
  name: string;
  rating: number | null;
  age: number | null;
  teamId: number | null;
  locked: boolean;
  groupKey: string | null;
}

async function loadMembers(divisionId: number): Promise<MemberInfo[]> {
  const db = supabaseAdmin();
  const { data } = await db
    .from('team_members')
    .select('id, team_id, locked, group_key, registrations(family_members(first_name, last_name, dob, staff_skill_rating))')
    .eq('division_id', divisionId);
  return (data ?? []).map((m) => {
    const fm = (m.registrations as unknown as { family_members: { first_name: string; last_name: string; dob: string | null; staff_skill_rating: number | null } | null } | null)?.family_members ?? null;
    let age: number | null = null;
    if (fm?.dob) {
      const dob = new Date(fm.dob + 'T12:00:00Z');
      age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 86400_000));
    }
    return {
      memberId: m.id,
      name: fm ? `${fm.first_name} ${fm.last_name}` : 'Unlinked registration',
      rating: fm?.staff_skill_rating ?? null,
      age,
      teamId: m.team_id,
      locked: !!m.locked,
      groupKey: m.group_key ?? null,
    };
  });
}

/** Run the balancing engine and store the result as a reviewable proposal. */
export async function proposeDraft(input: { divisionId: number; numTeams: number; attributes: BalanceAttribute[]; actorClerkId: string }): Promise<DraftProposal> {
  const db = supabaseAdmin();
  const members = await loadMembers(input.divisionId);
  if (!members.length) throw new Error('No roster members to draft.');
  if (input.numTeams < 2) throw new Error('Need at least 2 teams.');

  // Existing teams (by sort order) define the lockedTeam indices, so a player
  // locked to a team stays there across regenerations.
  const { data: teamsRows } = await db.from('teams').select('id').eq('division_id', input.divisionId).order('sort_order');
  const teamIndexById = new Map((teamsRows ?? []).slice(0, input.numTeams).map((t, i) => [t.id, i]));

  const players: DraftPlayer[] = members.map((m) => ({
    id: m.memberId,
    skill: input.attributes.includes('skill') ? (m.rating ?? undefined) : undefined,
    age: input.attributes.includes('age') ? (m.age ?? undefined) : undefined,
    lockedTeam: m.locked && m.teamId != null ? teamIndexById.get(m.teamId) : undefined,
    groupKey: m.groupKey ?? undefined,
  }));

  const result = balanceDraft(players, input.numTeams, input.attributes);
  const infoById = new Map(members.map((m) => [m.memberId, m]));
  const teams: ProposalTeam[] = result.teams.map((ids, i) => {
    const ms = ids.map((id) => infoById.get(id)!).filter(Boolean);
    const rated = ms.filter((m) => m.rating != null);
    return {
      name: `Team ${i + 1}`,
      members: ms
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        .map((m) => ({ memberId: m.memberId, name: m.name, rating: m.rating })),
      avgSkill: rated.length ? rated.reduce((n, m) => n + (m.rating ?? 0), 0) / rated.length : null,
    };
  });

  const { data: row, error } = await db
    .from('ai_proposals')
    .insert({
      kind: 'roster',
      target_ref: `division:${input.divisionId}`,
      proposal: { numTeams: input.numTeams, attributes: input.attributes, teams: result.teams, spread: result.spread },
      narrative: `Balanced ${members.length} players into ${input.numTeams} teams on ${input.attributes.join(', ') || 'roster size'}.`,
      status: 'proposed',
      created_by: input.actorClerkId,
    })
    .select('id, created_at')
    .single();
  if (error) throw new Error(error.message);
  await audit({ actorId: input.actorClerkId, action: 'division.draft-proposed', target: `division:${input.divisionId}`, meta: { proposalId: row.id, numTeams: input.numTeams, spread: result.spread } });
  return { proposalId: row.id, numTeams: input.numTeams, attributes: input.attributes, teams, spread: result.spread as Record<string, number>, createdAt: row.created_at };
}

/** Latest un-reviewed proposal for a division, hydrated with names for the preview. */
export async function latestProposal(divisionId: number): Promise<DraftProposal | null> {
  const db = supabaseAdmin();
  const { data } = await db
    .from('ai_proposals')
    .select('id, proposal, created_at')
    .eq('kind', 'roster')
    .eq('target_ref', `division:${divisionId}`)
    .eq('status', 'proposed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const p = data.proposal as { numTeams: number; attributes: BalanceAttribute[]; teams: number[][]; spread: Record<string, number> };
  const members = await loadMembers(divisionId);
  const infoById = new Map(members.map((m) => [m.memberId, m]));
  const teams: ProposalTeam[] = (p.teams ?? []).map((ids, i) => {
    const ms = ids.map((id) => infoById.get(id)).filter(Boolean) as MemberInfo[];
    const rated = ms.filter((m) => m.rating != null);
    return {
      name: `Team ${i + 1}`,
      members: ms.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).map((m) => ({ memberId: m.memberId, name: m.name, rating: m.rating })),
      avgSkill: rated.length ? rated.reduce((n, m) => n + (m.rating ?? 0), 0) / rated.length : null,
    };
  });
  return { proposalId: data.id, numTeams: p.numTeams, attributes: p.attributes ?? [], teams, spread: p.spread ?? {}, createdAt: data.created_at };
}

/**
 * Approve a proposal: reuse the division's existing teams in sort order,
 * create any that are missing, and point every roster row at its team. The
 * only path that writes team assignments from a draft.
 */
export async function applyDraft(proposalId: number, actorClerkId: string): Promise<{ divisionId: number; teamIds: number[] }> {
  const db = supabaseAdmin();
  const { data: prop } = await db.from('ai_proposals').select('id, target_ref, proposal, status').eq('id', proposalId).maybeSingle();
  if (!prop) throw new Error('Proposal not found.');
  if (prop.status !== 'proposed') throw new Error('Proposal was already reviewed.');
  const divisionId = Number(String(prop.target_ref).split(':')[1]);
  const p = prop.proposal as { numTeams: number; teams: number[][] };

  const { data: existing } = await db.from('teams').select('id').eq('division_id', divisionId).order('sort_order');
  const teamIds: number[] = (existing ?? []).slice(0, p.numTeams).map((t) => t.id);
  for (let i = teamIds.length; i < p.numTeams; i++) {
    const { data: t, error } = await db.from('teams').insert({ division_id: divisionId, name: `Team ${i + 1}`, sort_order: i }).select('id').single();
    if (error) throw new Error(error.message);
    teamIds.push(t.id);
  }

  for (let ti = 0; ti < p.teams.length; ti++) {
    for (const memberId of p.teams[ti]) {
      const { error } = await db.from('team_members').update({ team_id: teamIds[ti] }).eq('id', memberId);
      if (error) throw new Error(error.message);
    }
  }
  const { error: updErr } = await db.from('ai_proposals').update({ status: 'approved', reviewed_by: actorClerkId }).eq('id', proposalId);
  if (updErr) throw new Error(updErr.message);
  await audit({ actorId: actorClerkId, action: 'division.draft-applied', target: `division:${divisionId}`, meta: { proposalId, numTeams: p.numTeams } });
  return { divisionId, teamIds };
}

/** Dismiss a proposal without applying it. */
export async function discardProposal(proposalId: number, actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('ai_proposals').update({ status: 'dismissed', reviewed_by: actorClerkId }).eq('id', proposalId).eq('status', 'proposed');
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'division.draft-dismissed', target: `proposal:${proposalId}` });
}
