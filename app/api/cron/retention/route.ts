import { NextRequest, NextResponse } from 'next/server';
import { recomputeAll, sendWeeklyDigest } from '@/lib/retention/retention';

export const dynamic = 'force-dynamic';

/** Retention cron (Module 16): recompute flags daily; Monday = weekly digest. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await recomputeAll();
  const torontoNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Toronto' }));
  const digest = torontoNow.getDay() === 1 ? await sendWeeklyDigest() : null;
  return NextResponse.json({ ok: true, ...result, digest });
}
