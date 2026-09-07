import { NextRequest, NextResponse } from 'next/server';
import { jsonError, readJson } from '@/lib/api/handlers';
import { getPortalSession } from '@/lib/auth';
import { recordScore } from '@/lib/promotions/promotions';

export const dynamic = 'force-dynamic';

/**
 * Game score submission (Module 20). Signed-in families only. The score is
 * client-reported, so recordScore applies window, cap, rate-limit and
 * best-score rules; awards remain a staff decision.
 */
export async function POST(req: NextRequest) {
  const session = await getPortalSession();
  if (!session.userId || !session.familyId) return jsonError('Sign in required', 401);
  if (!session.canTransact) return jsonError('This account cannot enter contests', 403);
  const body = await readJson<{ contestId?: unknown; score?: unknown }>(req);
  const contestId = Number(body?.contestId);
  const score = Number(body?.score);
  if (!Number.isInteger(contestId) || contestId <= 0 || !Number.isInteger(score)) return jsonError('contestId and integer score required', 400);
  const result = await recordScore(contestId, session.familyId, score);
  return NextResponse.json(result, { status: result.recorded ? 200 : 400 });
}
