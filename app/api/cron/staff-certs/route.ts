import { NextResponse } from 'next/server';
import { cronRoute } from '@/lib/api/handlers';
import { processCertExpiries } from '@/lib/staff/staff';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Cron: warn on staff certifications expiring within 30 days (warn-only, never
 * blocks assignment). Scheduled in vercel.json.
 */
export const GET = cronRoute(async () => NextResponse.json(await processCertExpiries()));
