import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * DEV-ONLY: exercises the Module 1 Stage-1 schema end to end with synthetic
 * rows — inserts across every table, verifies FKs + the one-HoH-per-family
 * unique index + check constraints actually enforce, then cleans up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const tag = `dev_verify_${Date.now()}`;
  let profileId: number | null = null;
  let familyId: number | null = null;

  try {
    // 1. profile insert (customer defaults)
    const { data: prof, error: e1 } = await db
      .from('profiles')
      .insert({ clerk_user_id: tag, email: `${tag}@example.test`, first_name: 'Dev', last_name: 'Verify' })
      .select('id, user_type, status')
      .single();
    if (e1) throw new Error(`profile insert: ${e1.message}`);
    profileId = prof.id;
    record('profile insert + defaults', prof.user_type === 'customer' && prof.status === 'active', JSON.stringify(prof));

    // 2. family + link + HoH roster row
    const { data: fam, error: e2 } = await db
      .from('families')
      .insert({ name: 'Verify Household', hoh_profile_id: profileId })
      .select('id, play_points_balance')
      .single();
    if (e2) throw new Error(`family insert: ${e2.message}`);
    familyId = fam.id;
    await db.from('profiles').update({ family_id: familyId }).eq('id', profileId);
    const { error: e3 } = await db.from('family_members').insert({
      family_id: familyId, profile_id: profileId, first_name: 'Dev', last_name: 'Verify',
      dob: '1985-06-15', member_role: 'hoh',
    });
    if (e3) throw new Error(`hoh member insert: ${e3.message}`);
    record('family + hoh roster row', fam.play_points_balance === 0, `family ${familyId}`);

    // 3. one-HoH-per-family enforced (second hoh row must FAIL)
    const { error: dupHoh } = await db.from('family_members').insert({
      family_id: familyId, first_name: 'Second', last_name: 'Hoh', member_role: 'hoh',
    });
    record('duplicate HoH rejected', !!dupHoh, dupHoh?.message ?? 'ACCEPTED (constraint missing!)');

    // 4. dependent without profile (no login) allowed
    const { error: e4 } = await db.from('family_members').insert({
      family_id: familyId, first_name: 'Kid', last_name: 'Verify', dob: '2015-03-01', member_role: 'dependent',
    });
    record('dependent w/o login allowed', !e4, e4?.message ?? 'ok');

    // 5. bad member_role rejected by CHECK
    const { error: badRole } = await db.from('family_members').insert({
      family_id: familyId, first_name: 'X', last_name: 'Y', member_role: 'grandparent',
    });
    record('invalid member_role rejected', !!badRole, badRole?.message ?? 'ACCEPTED (check missing!)');

    // 6. seeded roles present + assignment unique
    const { data: roles } = await db.from('roles').select('id, name').order('name');
    const roleNames = (roles ?? []).map((r) => r.name);
    const coach = (roles ?? []).find((r) => r.name === 'Coach');
    record('6 seeded roles', ['Admin','Assistant Coach','Coach','Convenor','Facility Coordinator','Volunteer'].every((n) => roleNames.includes(n)), roleNames.join(', '));
    await db.from('role_assignments').insert({ profile_id: profileId, role_id: coach!.id, granted_by: 'system:verify' });
    const { error: dupAssign } = await db.from('role_assignments').insert({ profile_id: profileId, role_id: coach!.id });
    record('customer holds role; duplicate assignment rejected', !!dupAssign, dupAssign?.message ?? 'ACCEPTED (unique missing!)');

    // 7. staff credit account + negative balance rejected
    const { error: e7 } = await db.from('staff_credit_accounts').insert({
      profile_id: profileId, balance_cents: 10000, season_key: '2026-2',
    });
    record('staff credit account', !e7, e7?.message ?? 'balance $100.00, season 2026-2');
    const { error: negBal } = await db.from('staff_credit_accounts').update({ balance_cents: -1 }).eq('profile_id', profileId);
    record('negative credit balance rejected', !!negBal, negBal?.message ?? 'ACCEPTED (check missing!)');

    // 8. points ledger + default cap setting readable
    const { error: e8 } = await db.from('play_points_ledger').insert({
      family_id: familyId, delta_points: 500, reason: 'verify.earn', ref: tag, created_by: 'system:verify',
    });
    const { data: cap } = await db.from('portal_settings').select('value').eq('key', 'staff_credit_default_cap_cents').single();
    record('points ledger + default cap', !e8 && cap?.value === 10000, `ledger ok, default cap ${JSON.stringify(cap?.value)}¢`);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (familyId) {
      await db.from('profiles').update({ family_id: null }).eq('id', profileId!);
      await db.from('families').delete().eq('id', familyId); // cascades members + ledger
    }
    if (profileId) await db.from('profiles').delete().eq('id', profileId); // cascades assignments + credit
    record('cleanup', true, 'synthetic rows removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
