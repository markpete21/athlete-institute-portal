import { NextResponse } from 'next/server';
import {
  ageOn,
  canManageFamily,
  canSelfRegister,
  canTransactForFamily,
  memberRoleAfterBirthdays,
} from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { addFamilyMember, getOrCreateFamily, loadFamily, memberRowFor, removeFamilyMember } from '@/lib/family';
import type { Profile } from '@/lib/profile';

/**
 * DEV-ONLY: exercises Stage-3 family flows end to end with synthetic rows —
 * first-touch family creation (HoH), member add (incl. the email-notification
 * path, which reports 'skipped' until Resend keys exist), the 18+ lazy
 * auto-conversion, the policy matrix, and removal rules. Cleaned up after.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const tag = `fam_${Date.now()}`;
  let profileId: number | null = null;
  let familyId: number | null = null;

  try {
    // 0. synthetic signed-in customer
    const { data: prof, error: e0 } = await db
      .from('profiles')
      .insert({ clerk_user_id: tag, email: `${tag}@example.test`, first_name: 'Fam', last_name: 'Verify' })
      .select('id, clerk_user_id, email, first_name, last_name, user_type, status, settings, family_id')
      .single();
    if (e0) throw new Error(e0.message);
    profileId = prof.id;

    // 1. first touch → family created, caller is HoH
    const family = await getOrCreateFamily(prof as Profile);
    familyId = family.id;
    const me = memberRowFor(family, profileId);
    record(
      'first-touch family creation → HoH',
      family.members.length === 1 && me?.member_role === 'hoh' && family.name.includes('Verify'),
      `family ${family.id} "${family.name}", role=${me?.member_role}`,
    );

    // 2. idempotent: second call returns the same family
    const again = await getOrCreateFamily({ ...(prof as Profile), family_id: familyId });
    record('get-or-create idempotent', again.id === familyId, `same family ${again.id}`);

    // 3. add dependent (no email) + adult-to-be with email (notify → skipped, no Resend key)
    await addFamilyMember({
      familyId, firstName: 'Kid', lastName: 'Verify', dob: '2016-09-01',
      memberRole: 'dependent', actorClerkId: tag,
    });
    const almostAdult = await addFamilyMember({
      familyId, firstName: 'Teen', lastName: 'Verify', dob: '2008-01-15', email: `${tag}-teen@example.test`,
      memberRole: 'dependent', actorClerkId: tag,
    });
    const loaded = await loadFamily(familyId);
    record('members added', loaded.members.length === 3, `${loaded.members.length} members`);

    // 4. 18+ lazy auto-conversion: dob 2008-01-15 is 18 by 2026-07 → adult
    const teen = loaded.members.find((m) => m.id === almostAdult.id);
    const kid = loaded.members.find((m) => m.first_name === 'Kid');
    record(
      '18+ auto-conversion on load (dependent → adult)',
      teen?.member_role === 'adult' && kid?.member_role === 'dependent',
      `teen=${teen?.member_role} (dob 2008), kid=${kid?.member_role} (dob 2016)`,
    );

    // 5. policy matrix (pure)
    const matrix =
      canManageFamily('hoh') && !canManageFamily('secondary') && !canManageFamily('adult') &&
      canTransactForFamily('secondary') && !canTransactForFamily('dependent') && !canTransactForFamily('adult') &&
      canSelfRegister('adult') && !canSelfRegister('dependent');
    record('policy matrix (manage/transact/self-register)', matrix, 'hoh manages; secondary transacts-not-alters; dependent view-only; adult self-serves');

    // 6. age math sanity (leap-year + pre-birthday edges)
    const edges =
      ageOn('2008-07-23', '2026-07-22') === 17 &&
      ageOn('2008-07-22', '2026-07-22') === 18 &&
      memberRoleAfterBirthdays('adult', '1990-01-01', '2026-07-22') === 'adult' &&
      memberRoleAfterBirthdays('secondary', null, '2026-07-22') === 'secondary';
    record('age edges (day-before-birthday, stability)', edges, 'ok');

    // 7. HoH cannot be removed; dependent can
    let hohBlocked = false;
    try { await removeFamilyMember(me!.id, tag); } catch { hohBlocked = true; }
    await removeFamilyMember(kid!.id, tag);
    const after = await loadFamily(familyId);
    record('HoH removal blocked; member removal works', hohBlocked && after.members.length === 2, `blocked=${hohBlocked}, remaining=${after.members.length}`);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (profileId) await db.from('profiles').update({ family_id: null }).eq('id', profileId);
    if (familyId) await db.from('families').delete().eq('id', familyId);
    if (profileId) await db.from('profiles').delete().eq('id', profileId);
    record('cleanup', true, 'synthetic family removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
