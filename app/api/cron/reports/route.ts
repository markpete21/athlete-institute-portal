import { NextResponse } from 'next/server';
import { torontoParts } from '@ai/foundation';
import { cronRoute } from '@/lib/api/handlers';
import { sendExecReport } from '@/lib/reports/exec';
import { pullExpenses } from '@/lib/quickbooks/qbo';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Reporting cron (Module 14): nightly QBO expense sync; Monday = week-in-review;
 * 1st of month = month-in-review. Vercel cron hits this daily.
 */
export const GET = cronRoute(async () => {
  const now = new Date();
  const results: Record<string, unknown> = {};
  results.qbo = await pullExpenses('system:cron');

  const { weekday, dayOfMonth } = torontoParts(now);
  if (weekday === 1) results.weekly = await sendExecReport('week', now.toISOString());
  if (dayOfMonth === 1) results.monthly = await sendExecReport('month', now.toISOString());

  return NextResponse.json({ ok: true, ...results });
});
