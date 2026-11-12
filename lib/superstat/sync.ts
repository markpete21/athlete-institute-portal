import 'server-only';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { getBoxScore, getMatch, getMatchInsights, generateMatchInsights, listClubs, listClubTeams, listEvents, listTeamMatches, superstatConfigured } from './client';
import { boxScoreToSides, eventsToRows, linkMatch, suggestTeam, type GameRef, type MappedSide, type TeamLink } from './map';
import type { SsMatch } from './types';

/**
 * Pulls a site-run league's games from the league-owned Superstat club:
 * links each Superstat match to its scheduled game, and once a match is
 * complete loads the box score (both teams when both were tagged), the
 * play-by-play and the written team insights. It never publishes anything
 * and never touches a game's score: stats stay private until an editor
 * publishes them. Polling, because Superstat has no webhooks.
 */
export interface SyncSummary {
  connected: boolean; club: string | null; teamsLinked: number; matchesSeen: number; gamesLinked: number; statsLoaded: number;
  waiting: string[]; unlinked: string[]; skipped: string[]; errors: string[];
}

export interface StoredTeamLink extends TeamLink { superstatName: string | null }

export async function listTeamLinks(brandKey: string, leagueSlug: string): Promise<StoredTeamLink[]> {
  const { data, error } = await supabaseAdmin().from('site_league_superstat_teams').select('team, division, superstat_team_id, superstat_name').eq('brand_key', brandKey).eq('league_slug', leagueSlug);
  if (error || !data) return [];
  return data.map((r) => ({ team: r.team as string, division: (r.division as string) ?? '', superstatTeamId: r.superstat_team_id as string, superstatName: (r.superstat_name as string) ?? null }));
}

/** Set (or clear, with null) which Superstat team is a Circuit team in a division. */
export async function saveTeamLink(brandKey: string, leagueSlug: string, team: string, division: string, superstatTeamId: string | null, superstatName: string | null, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  if (!superstatTeamId) await db.from('site_league_superstat_teams').delete().eq('brand_key', brandKey).eq('league_slug', leagueSlug).eq('team', team).eq('division', division);
  else {
    const { error } = await db.from('site_league_superstat_teams').upsert({ brand_key: brandKey, league_slug: leagueSlug, team, division, superstat_team_id: superstatTeamId, superstat_name: superstatName }, { onConflict: 'brand_key,league_slug,team,division' });
    if (error) throw new Error(error.message);
  }
  await audit({ actorId: actorClerkId, action: 'site.league.superstat.team', target: `site:${brandKey}`, meta: { league: leagueSlug, team, division, superstatTeamId } });
}

const label = (m: SsMatch) => `${m.team.name} v ${m.opponent.name}${m.playedAt ? ` (${new Date(m.playedAt).toLocaleDateString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric' })})` : ''}`;

export async function syncLeague(brandKey: string, leagueSlug: string, actorClerkId: string, opts: { force?: boolean } = {}): Promise<SyncSummary> {
  const sum: SyncSummary = { connected: false, club: null, teamsLinked: 0, matchesSeen: 0, gamesLinked: 0, statsLoaded: 0, waiting: [], unlinked: [], skipped: [], errors: [] };
  if (!superstatConfigured()) return sum;
  const db = supabaseAdmin();
  const club = (await listClubs())[0];
  if (!club) { sum.errors.push('The key works, but no club came back.'); return sum; }
  sum.connected = true; sum.club = club.name;
  const ssTeams = await listClubTeams(club.id);

  const { data: gameRows, error: gErr } = await db.from('site_league_games').select('id, division, home, away, starts_at, superstat_match_id, superstat_synced_at').eq('brand_key', brandKey).eq('league_slug', leagueSlug);
  if (gErr || !gameRows) { sum.errors.push('Games could not be read (has migration 0107 been run?).'); return sum; }
  const games: (GameRef & { syncedAt: string | null })[] = gameRows.map((g) => ({ id: g.id as number, division: (g.division as string) ?? '', home: g.home as string, away: g.away as string, startsAt: (g.starts_at as string) ?? null, superstatMatchId: (g.superstat_match_id as string) ?? null, syncedAt: (g.superstat_synced_at as string) ?? null }));

  // Team links: stored ones, plus a suggestion for any team/division slot without one.
  let links = await listTeamLinks(brandKey, leagueSlug);
  const slots = new Map<string, { team: string; division: string }>();
  for (const g of games) for (const t of [g.home, g.away]) slots.set(`${g.division}|${t}`, { team: t, division: g.division });
  for (const s of slots.values()) {
    if (links.some((l) => l.team === s.team && l.division === s.division)) continue;
    const hit = suggestTeam(s.team, s.division, ssTeams);
    if (hit && !links.some((l) => l.superstatTeamId === hit.id)) { await saveTeamLink(brandKey, leagueSlug, s.team, s.division, hit.id, hit.name, 'system:superstat-sync'); links = [...links, { ...s, superstatTeamId: hit.id, superstatName: hit.name }]; }
  }
  sum.teamsLinked = links.length;

  // Every match of every linked team, once each.
  const seen = new Map<string, SsMatch>();
  for (const tid of new Set(links.map((l) => l.superstatTeamId))) {
    try { for (const m of await listTeamMatches(tid)) if (!seen.has(m.id) || m.recordedBy === 'team') seen.set(m.id, m); }
    catch (e) { sum.errors.push(`Matches for a team could not be read: ${e instanceof Error ? e.message : 'error'}`); }
  }
  sum.matchesSeen = seen.size;

  for (const listed of seen.values()) {
    try {
      // By id, the side that uploaded the footage is `team`: the box score uses the same view.
      const m = listed.status === 'complete' ? await getMatch(listed.id) : listed;
      const link = linkMatch(m, games, links);
      if (!link) { sum.unlinked.push(label(m)); continue; }
      const game = games.find((g) => g.id === link.gameId)!;
      const now = new Date().toISOString();
      const wasLinked = game.superstatMatchId === m.id;
      game.superstatMatchId = m.id;
      sum.gamesLinked += 1;
      if (m.status !== 'complete') {
        await db.from('site_league_games').update({ superstat_match_id: m.id, superstat_status: m.status }).eq('id', game.id);
        (m.status === 'failed' ? sum.errors : sum.waiting).push(`${label(m)}: ${m.status === 'failed' ? `failed${m.failureReason ? ` (${m.failureReason})` : ''}` : m.status.replace('_', ' ')}`);
        continue;
      }
      // Complete: load once, then refresh daily (box scores can be corrected) or when forced.
      const fresh = wasLinked && game.syncedAt && Date.now() - Date.parse(game.syncedAt) < 24 * 3600_000;
      if (fresh && !opts.force) continue;

      const sides = boxScoreToSides(await getBoxScore(m.id));
      const { data: rosterRows } = await db.from('site_league_players').select('id, team, number, name').eq('brand_key', brandKey).eq('league_slug', leagueSlug).eq('division', game.division).in('team', [link.teamName, link.opponentName]);
      const { data: existing } = await db.from('site_league_stat_lines').select('team, source').eq('game_id', game.id);
      const writeSide = async (teamName: string, side: MappedSide, tracked: boolean) => {
        // A box score someone pasted by hand wins over the sync.
        if ((existing ?? []).some((r) => r.team === teamName && r.source !== 'superstat')) { sum.skipped.push(`${teamName} (${label(m)}): kept the stats entered by hand`); return; }
        const roster = (rosterRows ?? []).filter((p) => p.team === teamName);
        const rows = [...(tracked ? side.lines : []), side.total].map((l, i) => {
          const p = l.isTotal ? undefined : roster.find((r) => (l.number && String(r.number ?? '').replace(/^#/, '') === l.number) || (l.name && String(r.name).trim().toLowerCase() === l.name.trim().toLowerCase()));
          return {
            brand_key: brandKey, league_slug: leagueSlug, game_id: game.id, division: game.division, team: teamName, is_total: l.isTotal, player_id: p?.id ?? null,
            number: l.number, name: l.isTotal ? 'TEAM' : (p?.name ?? l.name ?? null),
            pts: l.pts, reb: l.reb, ast: l.ast, stl: l.stl, blk: l.blk, tov: l.tov, oreb: l.oreb, dreb: l.dreb, pf: l.pf, fgm: l.fgm, fga: l.fga, tpm: l.tpm, tpa: l.tpa, ftm: l.ftm, fta: l.fta, min: l.min,
            sort_order: l.isTotal ? 999 : i, source: 'superstat', superstat_player_id: 'superstatPlayerId' in l ? (l as { superstatPlayerId: string | null }).superstatPlayerId : null, created_by: actorClerkId,
          };
        });
        await db.from('site_league_stat_lines').delete().eq('game_id', game.id).eq('team', teamName).eq('source', 'superstat');
        const { error } = await db.from('site_league_stat_lines').insert(rows);
        if (error) throw new Error(error.message);
      };
      await writeSide(link.teamName, sides.team, true);
      await writeSide(link.opponentName, sides.opponent, m.opponentStatsTracked && sides.opponent.lines.length > 0);
      if (!m.opponentStatsTracked) sum.skipped.push(`${link.opponentName} (${label(m)}): players weren't tagged in Superstat, team totals only`);

      // Play-by-play (timestamps + shot positions).
      const evRows = eventsToRows((await listEvents(m.id)).events ?? [], link.teamName, link.opponentName);
      await db.from('site_league_events').delete().eq('game_id', game.id);
      for (let i = 0; i < evRows.length; i += 500) {
        const { error } = await db.from('site_league_events').insert(evRows.slice(i, i + 500).map((e) => ({ brand_key: brandKey, league_slug: leagueSlug, game_id: game.id, seq: e.seq, type: e.type, success: e.success, team: e.team, number: e.number, name: e.name, period_number: e.periodNumber, period_type: e.periodType, period_seconds: e.periodSeconds, match_seconds: e.matchSeconds, x: e.x, y: e.y, custom_name: e.customName })));
        if (error) throw new Error(error.message);
      }

      // Written insights for the uploading side: ask for them if they don't exist yet, pick them up next run.
      try {
        let ins = await getMatchInsights(m.id);
        if (ins.status === 'not_generated') ins = await generateMatchInsights(m.id);
        await db.from('site_league_insights').upsert({ brand_key: brandKey, league_slug: leagueSlug, game_id: game.id, team: link.teamName, status: ins.status, payload: { summary: ins.summary ?? null, ratings: ins.ratings ?? null }, generated_at: ins.generatedAt ?? null, updated_at: now }, { onConflict: 'game_id,team' });
      } catch (e) { sum.errors.push(`Insights for ${label(m)}: ${e instanceof Error ? e.message : 'error'}`); }

      await db.from('site_league_games').update({ superstat_match_id: m.id, superstat_status: 'complete', superstat_synced_at: now }).eq('id', game.id);
      game.syncedAt = now;
      sum.statsLoaded += 1;
    } catch (e) {
      sum.errors.push(`${label(listed)}: ${e instanceof Error ? e.message : 'error'}`);
    }
  }
  await audit({ actorId: actorClerkId, action: 'site.league.superstat.sync', target: `site:${brandKey}`, meta: { league: leagueSlug, matches: sum.matchesSeen, linked: sum.gamesLinked, loaded: sum.statsLoaded, errors: sum.errors.length } });
  return sum;
}
