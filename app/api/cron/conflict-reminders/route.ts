import { NextRequest, NextResponse } from 'next/server';
import { processConflictReminders } from '@/lib/conflicts';

export const dynamic = 'force-dynamic';

/**
 * Cron endpoint: sends due keep-both double-booking reminders (Module 2
 * Stage 3). Wire in Vercel as a scheduled job (e.g. hourly):
 *   vercel.json -> { "crons": [{ "path": "/api/cron/conflict-reminders", "schedule": "0 * * * *" }] }
 * Vercel sends Authorization: Bearer $CRON_SECRET when the env var is set.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const operator = process.env.OPERATIONS_EMAIL ?? 'mark.peterson@athleteinstitute.ca';
  const result = await processConflictReminders(operator);
  return NextResponse.json(result);
}
