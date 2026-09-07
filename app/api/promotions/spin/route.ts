import { NextResponse } from 'next/server';
import { getPortalSession } from '@/lib/auth';
import { spinWheel } from '@/lib/promotions/promotions';

export const dynamic = 'force-dynamic';

/** Spin-to-win (Module 20). Entitlement + odds + credit all enforced server-side. */
export async function POST() {
  const session = await getPortalSession();
  if (!session.userId || !session.familyId) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (!session.canTransact) return NextResponse.json({ error: 'This account cannot earn points' }, { status: 403 });
  return NextResponse.json(await spinWheel(session.familyId));
}
