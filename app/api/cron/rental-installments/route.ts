import { NextRequest, NextResponse } from 'next/server';
import { processDueInstallments } from '@/lib/rentals/payments';

/**
 * Cron: process due rental installments (PAD auto-charge or invoice+reminder)
 * and flip past-due rentals to overdue. Wire in vercel.json (e.g. daily 6am):
 *   { "crons": [{ "path": "/api/cron/rental-installments", "schedule": "0 10 * * *" }] }
 * (10:00 UTC = 6am ET). Guarded by CRON_SECRET when set.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await processDueInstallments();
  return NextResponse.json(result);
}
