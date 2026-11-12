import { NextRequest, NextResponse } from 'next/server';
import { listGames } from '@/lib/site/league';
import { gameEvents, gameStatLines, gameStatsMeta, reelsUrls, setReelsUrl } from '@/lib/site/league-stats';

export const dynamic = 'force-dynamic';

/**
 * Site-run league stats for the Live app (highlight reels).
 *
 * GET  ?brand=allcan&league=circuit            → every game with its stats state
 * GET  ?brand=…&league=…&game=<id>            → that game plus plays and players
 * POST { brand, league, game, reelsUrl|null } → where the game's reels are sold
 *
 * Auth: a shared server-to-server secret in x-ecosystem-key (LEAGUE_STATS_KEY,
 * or the general ECOSYSTEM_API_KEY); closed until one is configured. Read-only apart from the
 * reels link. Plays carry Superstat's seconds into the uploaded footage.
 */
function authorized(req: NextRequest): boolean {
  const sent = req.headers.get('x-ecosystem-key');
  if (!sent) return false;
  return [process.env.LEAGUE_STATS_KEY, process.env.ECOSYSTEM_API_KEY].some((k) => !!k && k === sent);
}
const SLUG = /^[a-z0-9-]{1,60}$/;

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const q = req.nextUrl.searchParams;
  const brand = q.get('brand') ?? '', league = q.get('league') ?? '';
  if (!SLUG.test(brand) || !SLUG.test(league)) return NextResponse.json({ error: 'Bad brand or league' }, { status: 400 });
  const [games, meta, reels] = await Promise.all([listGames(brand, league), gameStatsMeta(brand, league), reelsUrls(brand, league)]);
  const view = (g: (typeof games)[number]) => {
    const m = meta.get(g.id);
    return { id: g.id, division: g.division, startsAt: g.startsAt, venue: g.venue, home: g.home, away: g.away, homeScore: g.homeScore, awayScore: g.awayScore, status: g.status, streamUrl: g.streamUrl, superstatMatchId: m?.superstatMatchId ?? null, superstatStatus: m?.superstatStatus ?? null, statsPublished: m?.published ?? false, reelsUrl: reels.get(g.id) ?? null };
  };
  const gameId = q.get('game');
  if (!gameId) return NextResponse.json({ games: games.map(view) });
  const game = games.find((g) => String(g.id) === gameId);
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [events, lines] = await Promise.all([gameEvents(brand, game.id), gameStatLines(brand, game.id)]);
  return NextResponse.json({
    game: view(game),
    plays: events.map((e) => ({ seq: e.seq, type: e.type, success: e.success, team: e.team, number: e.number, name: e.name, period: e.periodNumber, matchSeconds: e.matchSeconds })),
    players: lines.filter((l) => !l.isTotal).map((l) => ({ team: l.team, number: l.number, name: l.name, pts: l.pts })),
  });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { brand?: string; league?: string; game?: number; reelsUrl?: string | null };
  if (!SLUG.test(b.brand ?? '') || !SLUG.test(b.league ?? '') || !Number.isInteger(b.game)) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const url = b.reelsUrl == null ? null : String(b.reelsUrl);
  if (url && !/^https:\/\/[a-z0-9.-]+\//i.test(url)) return NextResponse.json({ error: 'Bad link' }, { status: 400 });
  const ok = await setReelsUrl(b.brand!, b.league!, b.game!, url);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Could not save (is migration 0108 run?)' }, { status: 500 });
}
