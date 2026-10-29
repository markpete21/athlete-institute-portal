import 'server-only';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { notify } from '@ai/foundation/notify';
import { brandLink } from '@ai/foundation';

/**
 * "Follow this team" (ALL CAN §5): signed-in families follow a team and get
 * schedule changes, postponements and final scores through notify(), using
 * the family's channel preferences. The public Compete data layer is
 * untouched; this only adds the follow table and the fan-out.
 */

export async function followedTeamIds(profileId: number): Promise<Set<number>> {
  const { data } = await supabaseAdmin().from('team_follows').select('team_id').eq('profile_id', profileId);
  return new Set((data ?? []).map((r) => r.team_id));
}

export async function toggleFollow(profileId: number, teamId: number): Promise<{ following: boolean }> {
  const db = supabaseAdmin();
  const { data } = await db.from('team_follows').select('team_id').eq('profile_id', profileId).eq('team_id', teamId).maybeSingle();
  if (data) { await db.from('team_follows').delete().eq('profile_id', profileId).eq('team_id', teamId); return { following: false }; }
  await db.from('team_follows').insert({ profile_id: profileId, team_id: teamId });
  return { following: true };
}

export interface FollowedTeam { teamId: number; teamName: string; divisionId: number; divisionName: string; brandKey: string | null }

export async function followedTeams(profileId: number): Promise<FollowedTeam[]> {
  const { data } = await supabaseAdmin().from('team_follows').select('team_id, teams(id, name, division_id, divisions(name, programs(brand_key)))').eq('profile_id', profileId);
  return (data ?? []).map((r) => {
    const t = r.teams as unknown as { id: number; name: string; division_id: number; divisions: { name: string; programs: { brand_key: string | null } | null } | null } | null;
    return { teamId: r.team_id, teamName: t?.name ?? 'Team', divisionId: t?.division_id ?? 0, divisionName: t?.divisions?.name ?? '', brandKey: t?.divisions?.programs?.brand_key ?? null };
  });
}

/**
 * Fan-out for a game event. Called by the score-entry and reschedule paths
 * (best effort). Recipients: every profile following either team.
 */
export async function notifyFollowers(gameId: number, kind: 'final' | 'rescheduled' | 'postponed'): Promise<number> {
  const db = supabaseAdmin();
  const { data: g } = await db.from('games').select('id, division_id, home_team_id, away_team_id, home_score, away_score, starts_at, divisions(name, programs(brand_key))').eq('id', gameId).maybeSingle();
  if (!g) return 0;
  const teamIds = [g.home_team_id, g.away_team_id].filter((x): x is number => !!x);
  if (!teamIds.length) return 0;
  const [{ data: teams }, { data: follows }] = await Promise.all([
    db.from('teams').select('id, name').in('id', teamIds),
    db.from('team_follows').select('profile_id, team_id, profiles(email, phone)').in('team_id', teamIds),
  ]);
  const name = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const d = g.divisions as unknown as { name: string; programs: { brand_key: string | null } | null } | null;
  const brandKey = d?.programs?.brand_key ?? null;
  const url = brandLink(brandKey, `/standings/${g.division_id}`, process.env.NEXT_PUBLIC_COMPETE_URL ?? 'https://compete.athleteinstitute.ca');
  const home = name.get(g.home_team_id ?? 0) ?? 'TBD', away = name.get(g.away_team_id ?? 0) ?? 'TBD';
  const when = g.starts_at ? new Date(g.starts_at).toLocaleString('en-CA', { timeZone: 'America/Toronto', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'TBD';
  const body = kind === 'final' ? `Final: ${home} ${g.home_score ?? 0}–${g.away_score ?? 0} ${away}.` : kind === 'postponed' ? `${home} vs ${away} on ${when} is postponed. We'll confirm the new time soon.` : `${home} vs ${away} has moved to ${when}.`;
  const seen = new Set<number>();
  let sent = 0;
  for (const f of follows ?? []) {
    if (seen.has(f.profile_id)) continue;
    seen.add(f.profile_id);
    const p = f.profiles as unknown as { email: string | null; phone: string | null } | null;
    await notify({ to: { email: p?.email ?? null, phone: kind === 'postponed' ? p?.phone ?? null : null }, channels: kind === 'postponed' ? ['email', 'sms'] : ['email'], brandKey, template: 'site.team-update', data: { teamName: name.get(f.team_id) ?? 'Your team', divisionName: d?.name ?? '', body, url } }).catch(() => {});
    sent += 1;
  }
  return sent;
}
