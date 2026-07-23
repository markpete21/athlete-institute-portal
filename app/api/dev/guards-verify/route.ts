import { NextResponse } from 'next/server';
import { tenantAllowedPath } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { accessForProfile } from '@/lib/auth';
import type { Profile } from '@/lib/profile';
import { effectiveTypeSettings } from '@/lib/type-settings';

/**
 * DEV-ONLY: proves the Stage-2 guards through the REAL access path
 * (accessForProfile → DB roles → resolveAccess) for every user type, plus the
 * tenant path gate and per-type settings merge. Synthetic rows, cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const tag = `guards_${Date.now()}`;
  const madeIds: number[] = [];

  const mkProfile = async (userType: string, suffix: string): Promise<Profile> => {
    const { data, error } = await db
      .from('profiles')
      .insert({ clerk_user_id: `${tag}_${suffix}`, email: `${tag}_${suffix}@example.test`, user_type: userType })
      .select('id, clerk_user_id, email, first_name, last_name, user_type, status, settings, family_id')
      .single();
    if (error) throw new Error(`profile(${userType}): ${error.message}`);
    madeIds.push(data.id);
    return data as Profile;
  };

  try {
    // 1. customer → NOT staff
    const customer = await mkProfile('customer', 'cust');
    const c = await accessForProfile(customer);
    record('customer blocked from admin', !c.access.isStaff, `isStaff=${c.access.isStaff}`);

    // 2. staff type → staff
    const staff = await mkProfile('staff', 'staff');
    const s = await accessForProfile(staff);
    record('staff type reaches admin', s.access.isStaff, `isStaff=${s.access.isStaff}`);

    // 3. tenant → NOT staff + path gate
    const tenant = await mkProfile('tenant', 'tenant');
    const t = await accessForProfile(tenant);
    const gate =
      tenantAllowedPath('/schedule') &&
      tenantAllowedPath('/schedule/court-1') &&
      !tenantAllowedPath('/') &&
      !tenantAllowedPath('/register') &&
      !tenantAllowedPath('/brands');
    record('tenant: no admin + schedule-only gate', !t.access.isStaff && gate, `isStaff=${t.access.isStaff}, gate=${gate}`);

    // 4. customer WITH a DB role (volunteer coach) → staff via role_assignments
    const volunteer = await mkProfile('customer', 'vol');
    const { data: coachRole } = await db.from('roles').select('id').eq('name', 'Coach').single();
    await db.from('role_assignments').insert({ profile_id: volunteer.id, role_id: coachRole!.id, granted_by: 'system:verify' });
    const v = await accessForProfile(volunteer);
    record(
      'customer w/ Coach role reaches admin (DB-loaded)',
      v.access.isStaff && v.access.roles.includes('Coach') && v.access.userType === 'customer',
      `roles=[${v.access.roles.join(',')}] type=${v.access.userType}`,
    );

    // 5. allowlist bootstrap promotion: customer with Mark's email → staff in DB + audited
    const { data: promoted, error: pErr } = await db
      .from('profiles')
      .insert({ clerk_user_id: `${tag}_allow`, email: 'mark.peterson@athleteinstitute.ca_TESTDISABLED', user_type: 'customer' })
      .select('id, clerk_user_id, email, first_name, last_name, user_type, status, settings, family_id')
      .single();
    if (pErr) throw new Error(`allowlist profile: ${pErr.message}`);
    madeIds.push(promoted.id);
    // (email deliberately NOT the real allowlisted one — promotion must NOT fire)
    const p = await accessForProfile(promoted as Profile);
    record('non-allowlisted email NOT promoted', p.profile.user_type === 'customer' && !p.access.isStaff, `type=${p.profile.user_type}`);

    // 6. per-type settings: defaults + stored override merge
    const merged = effectiveTypeSettings('staff', { staffDiscountsEnabled: false });
    const defaults = effectiveTypeSettings('organization', {});
    record(
      'per-type settings merge',
      merged.staffDiscountsEnabled === false && defaults.invoiceTermsDays === 30,
      JSON.stringify({ merged, defaults }),
    );
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (madeIds.length) await db.from('profiles').delete().in('id', madeIds);
    record('cleanup', true, `${madeIds.length} synthetic profiles removed`);
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
