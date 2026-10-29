import { NextRequest, NextResponse } from 'next/server';
import { publishDuePosts } from '@/lib/site/posts';

export const dynamic = 'force-dynamic';

/** Brand-site stories cron (Module 23 §3.6): publish scheduled stories whose time has come. Hourly. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const published = await publishDuePosts();
  return NextResponse.json({ ok: true, published });
}
