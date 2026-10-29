import { NextRequest, NextResponse } from 'next/server';
import { listSites, siteOrigin } from '@/lib/site/sites';
import { runAiChecks } from '@/lib/site/analytics';

export const dynamic = 'force-dynamic';

/**
 * AI-visibility checks (Module 23 §3.7): once a week, ask each configured
 * assistant the site's tracked questions and record whether the site is
 * cited. Skips sites that are not live and assistants without an API key,
 * so the budget is bounded by questions × connected assistants per week.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const sites = (await listSites()).filter((s) => s.status === 'live');
  const results: Record<string, number> = {};
  for (const s of sites) results[s.brandKey] = await runAiChecks(s.brandKey, siteOrigin(s), s.name);
  return NextResponse.json({ ok: true, results });
}
