import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { jsonError, readJson, secretRoute } from '@/lib/api/handlers';
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

/** Shared-secret guard: closed until ECOSYSTEM_API_KEY is configured. */
const ecosystem = (fn: Parameters<typeof secretRoute>[2]) => secretRoute('x-ecosystem-key', 'ECOSYSTEM_API_KEY', fn);

async function familyForClerkUser(clerkUserId: string): Promise<number | null> {
  const db = supabaseAdmin();
  const { data: prof } = await db.from('profiles').select('id, family_id').eq('clerk_user_id', clerkUserId).maybeSingle();
  if (!prof) return null;
  if (prof.family_id) return prof.family_id;
  // HoH linkage fallback.
  const { data: fam } = await db.from('families').select('id').eq('hoh_profile_id', prof.id).maybeSingle();
  return fam?.id ?? null;
}

export const GET = ecosystem(async (req) => {
  const clerkUserId = req.nextUrl.searchParams.get('clerkUserId');
  if (!clerkUserId) return jsonError('clerkUserId required', 400);

  const familyId = await familyForClerkUser(clerkUserId);
  if (!familyId) return jsonError('No household for that user', 404);
  const { data: fam } = await supabaseAdmin().from('families').select('play_points_balance').eq('id', familyId).maybeSingle();
  return NextResponse.json({ familyId, balance: fam?.play_points_balance ?? 0 });
});

interface PointsBody { clerkUserId?: string; action?: 'earn' | 'redeem'; points?: number; reason?: string; ref?: string }

export const POST = ecosystem(async (req) => {
  const body = await readJson<PointsBody>(req);
  if (!body) return jsonError('JSON body required', 400);
  const { clerkUserId, action, points, reason } = body;
  if (!clerkUserId || !action || !points || !reason) {
    return jsonError('clerkUserId, action, points, reason required', 400);
  }
  if (action !== 'earn' && action !== 'redeem') return jsonError("action must be 'earn' or 'redeem'", 400);
  if (!Number.isInteger(points) || points <= 0 || points > 1_000_000) {
    return jsonError('points must be a positive integer', 400);
  }

  if (reason.length > 200) return jsonError('reason too long (200 chars max)', 400);
  const ref = typeof body.ref === 'string' && body.ref.trim() ? body.ref.trim().slice(0, 120) : null;

  const familyId = await familyForClerkUser(clerkUserId);
  if (!familyId) return jsonError('No household for that user', 404);

  // Idempotent on `ref`: a retried request (network blip, at-least-once
  // queue) for the same household + ref returns the current balance instead
  // of crediting twice. Callers should always send a stable ref per event.
  if (ref) {
    const { data: dup } = await supabaseAdmin()
      .from('play_points_ledger')
      .select('id')
      .eq('family_id', familyId)
      .eq('ref', ref)
      .like('created_by', 'ecosystem:%')
      .limit(1)
      .maybeSingle();
    if (dup) {
      const { data: fam } = await supabaseAdmin().from('families').select('play_points_balance').eq('id', familyId).maybeSingle();
      return NextResponse.json({ familyId, balance: fam?.play_points_balance ?? 0, duplicate: true });
    }
  }

  try {
    const delta = action === 'redeem' ? -points : points;
    const balance = await applyPlayPoints(familyId, delta, `ecosystem: ${reason}`, `ecosystem:${reason.slice(0, 40)}`, ref ?? undefined);
    return NextResponse.json({ familyId, balance });
  } catch (err) {
    // Insufficient balance surfaces as a 409 the caller can show the user.
    const msg = err instanceof Error ? err.message : 'apply failed';
    return jsonError(msg, /insufficient/i.test(msg) ? 409 : 500);
  }
});
