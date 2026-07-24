import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * DEV-ONLY: cross-app Play Points API - shared-secret gate, balance lookup by
 * Clerk user, earn + redeem against the household ledger, insufficient-balance
 * 409, closed-without-key posture. Cleaned up.
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  let famId: number | null = null;
  let profileId: number | null = null;
  const base = `http://localhost:${req.nextUrl.port || 3000}/api/ecosystem/points`;
  const key = process.env.ECOSYSTEM_API_KEY ?? 'dev-ecosystem-key';
  const hadKey = !!process.env.ECOSYSTEM_API_KEY;
  if (!hadKey) process.env.ECOSYSTEM_API_KEY = key;

  try {
    const clerkId = `eco-verify-${Date.now()}`;
    const { data: prof } = await db.from('profiles').insert({ clerk_user_id: clerkId, email: `${clerkId}@example.test` }).select('id').single();
    profileId = prof!.id;
    const { data: fam } = await db.from('families').insert({ name: 'Eco Fam', hoh_profile_id: prof!.id, play_points_balance: 0 }).select('id').single();
    famId = fam!.id;

    // 1. unauthorized without the shared secret
    const noKey = await fetch(`${base}?clerkUserId=${clerkId}`, { cache: 'no-store' });
    record('rejects calls without the shared secret', noKey.status === 401, `${noKey.status}`);

    // 2. balance lookup by Clerk user (HoH linkage)
    const bal = await fetch(`${base}?clerkUserId=${clerkId}`, { headers: { 'x-ecosystem-key': key }, cache: 'no-store' });
    const balJson = await bal.json();
    record('balance lookup by clerk user', bal.status === 200 && balJson.familyId === famId && balJson.balance === 0, JSON.stringify(balJson));

    // 3. EARN from another app (e.g. tickets purchase)
    const earn = await fetch(base, { method: 'POST', headers: { 'x-ecosystem-key': key, 'content-type': 'application/json' }, body: JSON.stringify({ clerkUserId: clerkId, action: 'earn', points: 300, reason: 'tickets: event purchase' }), cache: 'no-store' });
    const earnJson = await earn.json();
    record('earn from another app credits the ledger', earn.status === 200 && earnJson.balance === 300, JSON.stringify(earnJson));

    // 4. REDEEM from another app (e.g. stream pass)
    const redeem = await fetch(base, { method: 'POST', headers: { 'x-ecosystem-key': key, 'content-type': 'application/json' }, body: JSON.stringify({ clerkUserId: clerkId, action: 'redeem', points: 200, reason: 'live: stream pass' }), cache: 'no-store' });
    const redeemJson = await redeem.json();
    record('redeem from another app debits the ledger', redeem.status === 200 && redeemJson.balance === 100, JSON.stringify(redeemJson));

    // 5. insufficient balance -> 409, balance unchanged
    const over = await fetch(base, { method: 'POST', headers: { 'x-ecosystem-key': key, 'content-type': 'application/json' }, body: JSON.stringify({ clerkUserId: clerkId, action: 'redeem', points: 999, reason: 'live: too much' }), cache: 'no-store' });
    const after = (await db.from('families').select('play_points_balance').eq('id', famId).single()).data!.play_points_balance;
    record('insufficient balance -> 409, no change', over.status === 409 && after === 100, `${over.status}, bal ${after}`);

    // 6. ledger reasons carry the app context (auditability)
    const { data: ledger } = await db.from('play_points_ledger').select('reason, delta_points').eq('family_id', famId).order('id');
    record('ledger entries attributed to source app', (ledger ?? []).length === 2 && ledger!.every((l) => l.reason.startsWith('ecosystem:')), JSON.stringify(ledger));
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (!hadKey) delete process.env.ECOSYSTEM_API_KEY;
    if (famId) { await db.from('play_points_ledger').delete().eq('family_id', famId); await db.from('families').delete().eq('id', famId); }
    if (profileId) await db.from('profiles').delete().eq('id', profileId);
    record('cleanup', true, 'family, profile, ledger removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
