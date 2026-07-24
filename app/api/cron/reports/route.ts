import { NextRequest, NextResponse } from 'next/server';
import { sendExecReport } from '@/lib/reports/exec';
import { pullExpenses } from '@/lib/quickbooks/qbo';

export const dynamic = 'force-dynamic';

/**
 * Reporting cron (Module 14): nightly QBO expense sync; Monday = week-in-review;
 * 1st of month = month-in-review. Vercel cron hits this daily with CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const results: Record<string, unknown> = {};
  results.qbo = await pullExpenses('system:cron');

  // Toronto-local day checks.
  const torontoNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Toronto' }));
  if (torontoNow.getDay() === 1) results.weekly = await sendExecReport('week', now.toISOString());
  if (torontoNow.getDate() === 1) results.monthly = await sendExecReport('month', now.toISOString());

  return NextResponse.json({ ok: true, ...results });
}
