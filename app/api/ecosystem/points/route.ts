import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { applyPlayPoints } from '@/lib/credits';

export const dynamic = 'force-dynamic';

/**
 * Cross-app Play Points API (ecosystem). The portal owns the household points
 * ledger; the other Athlete Institute apps (live stream, tickets, future team
 * app) EARN and REDEEM against it through this endpoint so points apply
 * everywhere. All apps share the Clerk instance, so callers identify the
 * household by the member's Clerk user id.
 *
 * Auth: shared-secret header (ECOSYSTEM_API_KEY, server-to-server only - set
 * the same value in each app's env). 100 points = $1 everywhere.
 *
 *   GET  ?clerkUserId=...                    -> { familyId, balance }
 *   POST { clerkUserId, action: 'earn'|'redeem', points, reason, ref? }
 *        -> { balance }   (earn adds; redeem subtracts - fails on insufficient)
 *
 * Redemption scope: the caller app decides what points buy on its side (e.g.
 * stream passes, tickets). Program-side exclusions (Academy/Club/rentals)
 * remain enforced by the M1 pricing function inside the portal.
 */

function authorized(req: NextRequest): boolean {
  const key = process.env.ECOSYSTEM_API_KEY;
  if (!key) return false; // closed until the shared secret is configured
  return req.headers.get('x-ecosystem-key') === key;
}

async function familyForClerkUser(clerkUserId: string): Promise<number | null> {
  const db = supabaseAdmin();
  const { data: prof } = await db.from('profiles').select('id, family_id').eq('clerk_user_id', clerkUserId).maybeSingle();
  if (!prof) return null;
  if (prof.family_id) return prof.family_id;
  // HoH linkage fallback.
  const { data: fam } = await db.from('families').select('id').eq('hoh_profile_id', prof.id).maybeSingle();
  return fam?.id ?? null;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const clerkUserId = req.nextUrl.searchParams.get('clerkUserId');
  if (!clerkUserId) return NextResponse.json({ error: 'clerkUserId required' }, { status: 400 });

  const familyId = await familyForClerkUser(clerkUserId);
  if (!familyId) return NextResponse.json({ error: 'No household for that user' }, { status: 404 });
  const { data: fam } = await supabaseAdmin().from('families').select('play_points_balance').eq('id', familyId).single();
  return NextResponse.json({ familyId, balance: fam?.play_points_balance ?? 0 });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json()) as { clerkUserId?: string; action?: 'earn' | 'redeem'; points?: number; reason?: string; ref?: string };
  const { clerkUserId, action, points, reason } = body;
  if (!clerkUserId || !action || !points || !reason) {
    return NextResponse.json({ error: 'clerkUserId, action, points, reason required' }, { status: 400 });
  }
  if (!Number.isInteger(points) || points <= 0 || points > 1_000_000) {
    return NextResponse.json({ error: 'points must be a positive integer' }, { status: 400 });
  }

  const familyId = await familyForClerkUser(clerkUserId);
  if (!familyId) return NextResponse.json({ error: 'No household for that user' }, { status: 404 });

  try {
    const delta = action === 'redeem' ? -points : points;
    const balance = await applyPlayPoints(familyId, delta, `ecosystem: ${reason}`, `ecosystem:${reason.slice(0, 40)}`, body.ref);
    return NextResponse.json({ familyId, balance });
  } catch (err) {
    // Insufficient balance surfaces as a 409 the caller can show the user.
    const msg = err instanceof Error ? err.message : 'apply failed';
    return NextResponse.json({ error: msg }, { status: /insufficient/i.test(msg) ? 409 : 500 });
  }
}
