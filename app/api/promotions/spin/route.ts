import { NextResponse } from 'next/server';
import { getPortalSession } from '@/lib/auth';
import { spinWheel } from '@/lib/promotions/promotions';

export const dynamic = 'force-dynamic';

/** Spin-to-win (Module 20). Unlock enforced server-side; prize logged + credited. */
export async function POST() {
  const session = await getPortalSession();
  if (!session.userId || !session.familyId) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const result = await spinWheel(session.familyId);
  return NextResponse.json(result);
}
