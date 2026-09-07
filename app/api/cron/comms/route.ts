import { NextResponse } from 'next/server';
import { cronRoute } from '@/lib/api/handlers';
import { drainSendingCampaigns, processDueCampaigns } from '@/lib/comms/campaigns';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Communications cron (Module 13), hourly: start scheduled campaigns whose
 * time has come, then keep draining any campaign still `sending` so a large
 * blast finishes across runs instead of inside one request.
 */
export const GET = cronRoute(async () => {
  const started = await processDueCampaigns();
  const drained = await drainSendingCampaigns();
  return NextResponse.json({ ok: true, started, drained });
});
