import { NextRequest, NextResponse } from 'next/server';
import { getPortalSession } from '@/lib/auth';
import { recordScore } from '@/lib/promotions/promotions';

export const dynamic = 'force-dynamic';

/** Game score submission (Module 20). Signed-in families only; window-enforced. */
export async function POST(req: NextRequest) {
  const session = await getPortalSession();
  if (!session.userId || !session.familyId) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const { contestId, score } = (await req.json()) as { contestId: number; score: number };
  const result = await recordScore(Number(contestId), session.familyId, Number(score));
  return NextResponse.json(result, { status: result.recorded ? 200 : 400 });
}
