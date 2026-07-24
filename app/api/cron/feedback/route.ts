import { NextRequest, NextResponse } from 'next/server';
import { processDuePrompts } from '@/lib/feedback/feedback';

export const dynamic = 'force-dynamic';

/** Feedback cron (Module 15): fire due prompts + the single reminder. Daily. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await processDuePrompts();
  return NextResponse.json({ ok: true, ...result });
}
