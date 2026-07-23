import { NextRequest, NextResponse } from 'next/server';
import { processCertExpiries } from '@/lib/staff/staff';

export const dynamic = 'force-dynamic';

/**
 * Cron: warn on staff certifications expiring within 30 days (warn-only, never
 * blocks assignment). vercel.json e.g. weekly. Guarded by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(await processCertExpiries());
}
