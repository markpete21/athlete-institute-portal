import { NextRequest, NextResponse } from 'next/server';
import { superstatConfigured } from '@/lib/superstat/client';
import { syncLeague } from '@/lib/superstat/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Site-run leagues read from the league-owned Superstat club. */
const LEAGUES: { brandKey: string; leagueSlug: string }[] = [{ brandKey: 'all-can', leagueSlug: 'circuit' }];

/**
 * Superstat sync (hourly): link matches to games and load finished games'
 * stats. Superstat has no webhooks, so this polls. Does nothing until
 * SUPERSTAT_API_KEY is set. Loaded stats stay unpublished.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!superstatConfigured()) return NextResponse.json({ ok: true, connected: false });
  const results = [];
  for (const l of LEAGUES) {
    try { results.push({ ...l, ...(await syncLeague(l.brandKey, l.leagueSlug, 'system:cron')) }); }
    catch (e) { results.push({ ...l, error: e instanceof Error ? e.message : 'error' }); }
  }
  return NextResponse.json({ ok: true, results });
}
