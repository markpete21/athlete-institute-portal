import { NextResponse } from 'next/server';
import { currentSeason } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { applyPlayPoints, ensureSeasonCredit, seasonKeyOf, spendStaffCredit } from '@/lib/credits';

/**
 * DEV-ONLY: exercises Stage-4 credit/points flows against live Supabase —
 * open-at-cap, spend, TOP-UP-TO-CAP (not +=) on season rollover, cap override,
 * atomic points earn/spend with ledger+balance consistency, overdraw guards.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const tag = `cred_${Date.now()}`;
  let profileId: number | null = null;
  let familyId: number | null = null;

  try {
    const { data: prof } = await db
      .from('profiles')
      .insert({ clerk_user_id: tag, email: `${tag}@example.test`, user_type: 'staff' })
      .select('id')
      .single();
    const pid: number = prof!.id;
    profileId = pid;
    const { data: fam } = await db
      .from('families')
      .insert({ name: 'Credit Verify', hoh_profile_id: pid })
      .select('id')
      .single();
    const fid: number = fam!.id;
    familyId = fid;

    // 1. first ensure → account opened AT the default cap ($100)
    const opened = await ensureSeasonCredit(pid);
    record('account opened at default cap', opened.balanceCents === 10000 && opened.toppedUp, JSON.stringify(opened));

    // 2. spend $60 → $40
    const afterSpend = await spendStaffCredit(pid, 6000, 'system:verify');
    record('spend draws down', afterSpend === 4000, `balance ${afterSpend}¢`);

    // 3. overdraw rejected
    let overdraw = false;
    try { await spendStaffCredit(pid, 4001, 'system:verify'); } catch { overdraw = true; }
    record('overdraw rejected', overdraw, 'spend > balance raises');

    // 4. season rollover: fake a previous season, ensure → balance = cap (NOT cap + leftover)
    await db.from('staff_credit_accounts').update({ season_key: '2025:sep-dec' }).eq('profile_id', pid);
    const rolled = await ensureSeasonCredit(pid);
    record(
      'rollover tops up TO cap (leftover $40 → $100, not $140)',
      rolled.balanceCents === 10000 && rolled.toppedUp && rolled.seasonKey === seasonKeyOf(currentSeason()),
      JSON.stringify(rolled),
    );

    // 5. same season again → no top-up
    const stable = await ensureSeasonCredit(pid);
    record('same season is stable (no re-top-up)', !stable.toppedUp && stable.balanceCents === 10000, JSON.stringify(stable));

    // 6. cap override: set $250, rollover again → $250
    await db.from('staff_credit_accounts').update({ cap_override_cents: 25000, season_key: '2025:may-aug' }).eq('profile_id', pid);
    const overridden = await ensureSeasonCredit(pid);
    record('cap override honored on top-up', overridden.balanceCents === 25000 && overridden.capCents === 25000, JSON.stringify(overridden));

    // 7. points: earn 500, spend 200 → balance 300, ledger has 2 rows, sums match
    await applyPlayPoints(fid, 500, 'verify.earn', 'system:verify', tag);
    const bal = await applyPlayPoints(fid, -200, 'verify.spend', 'system:verify', tag);
    const { data: famRow } = await db.from('families').select('play_points_balance').eq('id', fid).single();
    const { data: ledger } = await db.from('play_points_ledger').select('delta_points').eq('family_id', fid);
    const ledgerSum = (ledger ?? []).reduce((a, r) => a + r.delta_points, 0);
    record(
      'points atomic: balance = ledger sum',
      bal === 300 && famRow!.play_points_balance === 300 && ledgerSum === 300 && ledger!.length === 2,
      `balance ${bal}, ledger sum ${ledgerSum} over ${ledger!.length} rows`,
    );

    // 8. points overdraw rejected, balance unchanged
    let pointsOverdraw = false;
    try { await applyPlayPoints(fid, -301, 'verify.overdraw', 'system:verify'); } catch { pointsOverdraw = true; }
    const { data: after } = await db.from('families').select('play_points_balance').eq('id', fid).single();
    record('points overdraw rejected atomically', pointsOverdraw && after!.play_points_balance === 300, `balance still ${after!.play_points_balance}`);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (familyId) await db.from('families').delete().eq('id', familyId);
    if (profileId) await db.from('profiles').delete().eq('id', profileId);
    record('cleanup', true, 'synthetic rows removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
