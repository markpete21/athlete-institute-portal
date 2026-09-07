import { NextResponse } from 'next/server';
import { torontoParts } from '@ai/foundation';
import { cronRoute } from '@/lib/api/handlers';
import { recomputeAll, sendWeeklyDigest } from '@/lib/retention/retention';

export const dynamic = 'force-dynamic';

/** Retention cron (Module 16): recompute flags daily; Monday = weekly digest. */
export const GET = cronRoute(async () => {
  const result = await recomputeAll();
  const digest = torontoParts().weekday === 1 ? await sendWeeklyDigest() : null;
  return NextResponse.json({ ok: true, ...result, digest });
});
