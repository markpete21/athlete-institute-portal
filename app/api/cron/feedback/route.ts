import { NextResponse } from 'next/server';
import { cronRoute } from '@/lib/api/handlers';
import { processDuePrompts } from '@/lib/feedback/feedback';

export const dynamic = 'force-dynamic';

/** Feedback cron (Module 15): fire due prompts + the single reminder. Daily. */
export const GET = cronRoute(async () => {
  const result = await processDuePrompts();
  return NextResponse.json({ ok: true, ...result });
});
