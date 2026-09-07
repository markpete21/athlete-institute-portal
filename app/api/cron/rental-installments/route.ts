import { NextResponse } from 'next/server';
import { cronRoute } from '@/lib/api/handlers';
import { processDueInstallments } from '@/lib/rentals/payments';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Cron: process due rental installments (PAD auto-charge or invoice+reminder)
 * and flip past-due rentals to overdue. Daily 10:00 UTC (6am ET) per vercel.json.
 */
export const GET = cronRoute(async () => NextResponse.json(await processDueInstallments()));
