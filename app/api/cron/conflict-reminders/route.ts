import { NextResponse } from 'next/server';
import { cronRoute } from '@/lib/api/handlers';
import { processConflictReminders } from '@/lib/conflicts';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Cron: sends due keep-both double-booking reminders (Module 2 Stage 3).
 * Scheduled in vercel.json; guarded by CRON_SECRET via cronRoute().
 */
export const GET = cronRoute(async () => {
  const operator = process.env.OPERATIONS_EMAIL ?? 'mark.peterson@athleteinstitute.ca';
  return NextResponse.json(await processConflictReminders(operator));
});
