import { NextRequest, NextResponse } from 'next/server';
import { getPortalSession } from '@/lib/auth';
import { runAssist, type AssistMessage } from '@/lib/assist/core';
import type { Surface } from '@/lib/assist/tools';

export const dynamic = 'force-dynamic';

/**
 * Assist endpoint (Module 21). Surface + scope are resolved SERVER-side from
 * the session - the client can request a surface but never escalate: customer
 * requires a signed-in household; admin requires staff. Rate keys: ip (public),
 * family (customer), profile (admin).
 */
export async function POST(req: NextRequest) {
  const { surface: requested, messages } = (await req.json()) as { surface?: Surface; messages: AssistMessage[] };
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 30) {
    return NextResponse.json({ error: 'messages required' }, { status: 400 });
  }

  const session = await getPortalSession();
  let surface: Surface = 'public';
  // Anonymous fallback only: the leftmost x-forwarded-for hop is client-supplied
  // and spoofable, so it's a soft limit at best — the global hourly cap in
  // runAssist() is what actually bounds spend. Any signed-in caller is keyed on
  // their Clerk user id instead.
  let rateKey = session.userId
    ? `user:${session.userId}`
    : `ip:${req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown'}`;
  const ctx = { familyId: session.familyId, profileId: session.profileId, isStaff: session.isStaff };

  if (requested === 'admin' && session.isStaff) {
    surface = 'admin';
    rateKey = `profile:${session.profileId}`;
  } else if (requested === 'customer' && session.userId && session.familyId) {
    surface = 'customer';
    rateKey = `family:${session.familyId}`;
  }

  const result = await runAssist(surface, rateKey, messages.map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) })), ctx);
  return NextResponse.json({ surface, ...result });
}
