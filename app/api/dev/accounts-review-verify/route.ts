import { NextResponse } from 'next/server';
import { torontoToday } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { mergeAccounts } from '@/lib/accounts/merge';
import { loadFamily, removeFamilyMember, shareDependent, unshareDependent, updateFamilyMember } from '@/lib/family';
import { adoptUnclaimedProfileByToken, stageRows } from '@/lib/import/playbook';
import { accountView } from '@/lib/play/account';
import { placeProgramOrder, quoteCheckout } from '@/lib/programs/checkout';
import { householdOutstanding } from '@/lib/programs/pay';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';

/**
 * DEV-ONLY: Accounts-review features — dual-household dependents (share /
 * both-rosters / unshare / promote-on-remove / adult-conversion clears),
 * member editing, account merge (households, balances, roles), claim-token
 * adoption, staff-credit checkout wiring, suspension gate, /account/pay
 * outstanding math, and the blocked import dedupe. Cleans up after itself.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const t = Date.now();
  const profileIds: number[] = [];
  const familyIds: number[] = [];
  const programIds: number[] = [];

  const mkProfile = async (patch: Record<string, unknown> = {}) => {
    const { data, error } = await db.from('profiles')
      .insert({ clerk_user_id: `arv_${t}_${profileIds.length}`, email: `arv_${t}_${profileIds.length}@example.test`, ...patch })
      .select('id, clerk_user_id, email').single();
    if (error) throw new Error(error.message);
    profileIds.push(data.id);
    return data;
  };
  const mkFamily = async (name: string, hohProfileId: number, patch: Record<string, unknown> = {}) => {
    const { data, error } = await db.from('families')
      .insert({ name, hoh_profile_id: hohProfileId, ...patch }).select('id').single();
    if (error) throw new Error(error.message);
    familyIds.push(data.id);
    await db.from('profiles').update({ family_id: data.id }).eq('id', hohProfileId);
    const { error: e2 } = await db.from('family_members').insert({
      family_id: data.id, profile_id: hohProfileId, first_name: name, last_name: 'HoH', member_role: 'hoh',
    });
    if (e2) throw new Error(e2.message);
    return data.id as number;
  };

  try {
    // ------------------------------------------------------------------ setup
    const pA = await mkProfile();
    const famA = await mkFamily('ArvA', pA.id);
    const pB = await mkProfile();
    const famB = await mkFamily('ArvB', pB.id);
    const { data: child } = await db.from('family_members')
      .insert({ family_id: famA, first_name: 'Kid', last_name: 'Arv', member_role: 'dependent', dob: '2015-03-01' })
      .select('id').single();

    // ------------------------------------------- 1. dual-household share flow
    await shareDependent({ memberId: child!.id, actorFamilyId: famA, targetEmail: pB.email!, actorClerkId: 'system:verify' });
    const [viewA, viewB] = [await loadFamily(famA), await loadFamily(famB)];
    record(
      'dual-household: child on BOTH rosters after share',
      viewA.members.some((m) => m.id === child!.id) && viewB.members.some((m) => m.id === child!.id),
      `A has ${viewA.members.length}, B has ${viewB.members.length}`,
    );

    // A registration placed by household B for the shared child is visible to A
    const types = await listProgramTypes();
    const league = types.find((x) => x.key === 'league')!;
    const prog = await createProgram({ name: 'Arv League', programTypeId: league.id, actorClerkId: 'system:verify' });
    programIds.push(prog.id);
    await db.from('programs').update({ base_price_cents: 10000, status: 'registration_open' }).eq('id', prog.id);
    const { data: regB } = await db.from('registrations')
      .insert({ program_id: prog.id, family_member_id: child!.id, family_id: famB, standing: 'brand_new', status: 'active' })
      .select('id').single();
    const acctA = await accountView(famA);
    const acctB = await accountView(famB);
    record(
      'dual-household: B-paid registration visible to A (and B)',
      acctA.registrations.some((r) => r.id === regB!.id) && acctB.registrations.some((r) => r.id === regB!.id),
      `A sees ${acctA.registrations.length}, B sees ${acctB.registrations.length}`,
    );
    record(
      'dual-household: money stays with the paying household',
      acctA.balance.totalCount === 0,
      `A installments ${acctA.balance.totalCount}`,
    );

    // Unshare from the second household; child untouched in primary
    await unshareDependent(child!.id, famB, 'system:verify');
    const afterUnshare = await loadFamily(famB);
    record(
      'dual-household: unshare removes from second household only',
      !afterUnshare.members.some((m) => m.id === child!.id)
        && (await loadFamily(famA)).members.some((m) => m.id === child!.id),
      'unlinked from B, kept in A',
    );

    // Re-share, then primary "remove" promotes the second household to primary
    await shareDependent({ memberId: child!.id, actorFamilyId: famA, targetEmail: pB.email!, actorClerkId: 'system:verify' });
    await removeFamilyMember(child!.id, 'system:verify', famA);
    const { data: promoted } = await db.from('family_members')
      .select('family_id, second_family_id').eq('id', child!.id).single();
    record(
      'dual-household: primary remove promotes the other household',
      promoted!.family_id === famB && promoted!.second_family_id === null,
      JSON.stringify(promoted),
    );

    // Adult conversion dissolves a live link (child is now primary in B, share to A)
    await shareDependent({ memberId: child!.id, actorFamilyId: famB, targetEmail: pA.email!, actorClerkId: 'system:verify' });
    await db.from('family_members').update({ dob: '2005-01-01' }).eq('id', child!.id);
    await loadFamily(famB); // conversion fires lazily on load
    const { data: adultNow } = await db.from('family_members')
      .select('member_role, second_family_id').eq('id', child!.id).single();
    record(
      'dual-household: 18+ conversion clears the link',
      adultNow!.member_role === 'adult' && adultNow!.second_family_id === null,
      JSON.stringify(adultNow),
    );

    // ------------------------------------------------------ 2. member editing
    const edited = await updateFamilyMember({
      memberId: child!.id, firstName: 'Kaden', email: 'kaden@example.test', actorClerkId: 'system:verify',
    });
    record('member edit persists', edited.first_name === 'Kaden' && edited.email === 'kaden@example.test', JSON.stringify({ f: edited.first_name, e: edited.email }));

    // ---------------------------------------------------------- 3. merge tool
    const pSrc = await mkProfile();
    const famSrc = await mkFamily('ArvSrc', pSrc.id, { play_points_balance: 300, credit_balance_cents: 1500 });
    const pDst = await mkProfile();
    const famDst = await mkFamily('ArvDst', pDst.id, { play_points_balance: 100, credit_balance_cents: 500 });
    await db.from('family_members').insert({ family_id: famSrc, first_name: 'SrcKid', last_name: 'Arv', member_role: 'dependent', dob: '2016-05-05' });
    const { data: role } = await db.from('roles').select('id').limit(1).single();
    await db.from('role_assignments').insert({ profile_id: pSrc.id, role_id: role!.id });
    const { error: ledgerErr } = await db.from('play_points_ledger')
      .insert({ family_id: famSrc, delta_points: 300, reason: 'arv:seed', created_by: 'system:verify' });
    if (ledgerErr) throw new Error(`ledger seed failed: ${ledgerErr.message}`);

    const merged = await mergeAccounts(pSrc.id, pDst.id, 'system:verify');
    const dstFam = await loadFamily(famDst);
    const { data: dstBal } = await db.from('families').select('play_points_balance, credit_balance_cents').eq('id', famDst).single();
    const { data: srcProf } = await db.from('profiles').select('status, settings, email, family_id').eq('id', pSrc.id).single();
    const { data: srcFamGone } = await db.from('families').select('id').eq('id', famSrc).maybeSingle();
    const { data: movedRole } = await db.from('role_assignments').select('id').eq('profile_id', pDst.id);
    const { data: movedLedger } = await db.from('play_points_ledger').select('id').eq('family_id', famDst).eq('reason', 'arv:seed');
    // Note: the source HoH's member row is re-pointed to the TARGET profile
    // (duplicate accounts are the same person), so we assert the demoted
    // secondary row exists rather than its old profile linkage.
    record('merge: members moved, source HoH demoted to secondary',
      dstFam.members.some((m) => m.first_name === 'SrcKid')
        && dstFam.members.some((m) => m.member_role === 'secondary'),
      `dst members ${dstFam.members.length}`);
    record('merge: balances added + ledger moved',
      dstBal!.play_points_balance === 400 && dstBal!.credit_balance_cents === 2000 && (movedLedger ?? []).length === 1,
      JSON.stringify(dstBal));
    record('merge: role moved, source archived with pointer, family deleted',
      (movedRole ?? []).length === 1
        && srcProf!.status === 'archived'
        && (srcProf!.settings as { merged_into?: number }).merged_into === pDst.id
        && srcProf!.email === null && srcProf!.family_id === null && !srcFamGone,
      JSON.stringify({ merged, srcStatus: srcProf!.status }));

    // -------------------------------------------------- 4. claim-token adopt
    const token = `arv-${t}-token`;
    const { data: unclaimed } = await db.from('profiles')
      .insert({ clerk_user_id: `unclaimed:${token}`, email: `arv_${t}_unclaimed@example.test`, claim_token: token, imported_from: 'playbook:verify' })
      .select('id').single();
    profileIds.push(unclaimed!.id);
    const adoptedId = await adoptUnclaimedProfileByToken(`arv_${t}_claimer`, token);
    const { data: claimed } = await db.from('profiles').select('clerk_user_id, claimed_at').eq('id', unclaimed!.id).single();
    record('claim token: adoption binds the new Clerk id (email may differ)',
      adoptedId === unclaimed!.id && claimed!.clerk_user_id === `arv_${t}_claimer` && !!claimed!.claimed_at,
      JSON.stringify(claimed));

    // -------------------------------------- 5. staff credit through checkout
    const pStaff = await mkProfile({ user_type: 'staff' });
    const famStaff = await mkFamily('ArvStaff', pStaff.id);
    const { data: sKid } = await db.from('family_members')
      .insert({ family_id: famStaff, first_name: 'SKid', last_name: 'Arv', member_role: 'dependent', dob: '2014-01-01' })
      .select('id').single();
    const { data: sReg } = await db.from('registrations')
      .insert({ program_id: prog.id, family_member_id: sKid!.id, family_id: famStaff, standing: 'brand_new', status: 'active' })
      .select('id').single();
    const sQuote = await quoteCheckout([sReg!.id], { useStaffCredit: true });
    record('staff credit: resolved automatically for a staff household',
      sQuote.staffCreditUsedCents > 0 && sQuote.staffProfileId === pStaff.id,
      `used ${sQuote.staffCreditUsedCents} from profile ${sQuote.staffProfileId}`);
    const before = await db.from('staff_credit_accounts').select('balance_cents').eq('profile_id', pStaff.id).single();
    const sPlaced = await placeProgramOrder({ registrationIds: [sReg!.id], useStaffCredit: true, payInFull: true, actorClerkId: pStaff.clerk_user_id });
    const after = await db.from('staff_credit_accounts').select('balance_cents').eq('profile_id', pStaff.id).single();
    record('staff credit: drawn down on order placement',
      after.data!.balance_cents === before.data!.balance_cents - sPlaced.quote.staffCreditUsedCents,
      `${before.data!.balance_cents} -> ${after.data!.balance_cents}`);

    // ------------------------------------------------------ 6. suspension gate
    const pSusp = await mkProfile({ status: 'suspended' });
    const famSusp = await mkFamily('ArvSusp', pSusp.id);
    const { data: suKid } = await db.from('family_members')
      .insert({ family_id: famSusp, first_name: 'SuKid', last_name: 'Arv', member_role: 'dependent', dob: '2014-01-01' })
      .select('id').single();
    const { data: suReg } = await db.from('registrations')
      .insert({ program_id: prog.id, family_member_id: suKid!.id, family_id: famSusp, standing: 'brand_new', status: 'active' })
      .select('id').single();
    let suspBlocked = false;
    try {
      await placeProgramOrder({ registrationIds: [suReg!.id], payInFull: true, actorClerkId: pSusp.clerk_user_id });
    } catch { suspBlocked = true; }
    record('suspension: suspended actor cannot place new orders', suspBlocked, suspBlocked ? 'rejected as expected' : 'ORDER WENT THROUGH');

    // --------------------------------------------- 7. /account/pay outstanding
    const { data: order } = await db.from('program_orders')
      .insert({ family_id: famB, subtotal_cents: 6000, total_cents: 6000, status: 'plan_active', created_by: 'system:verify' })
      .select('id').single();
    const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
    const nextWeek = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
    await db.from('program_installments').insert([
      { order_id: order!.id, seq: 1, label: 'Deposit', amount_cents: 2000, due_date: yesterday, status: 'pending' },
      { order_id: order!.id, seq: 2, label: 'Payment 2', amount_cents: 2000, due_date: nextWeek, status: 'pending' },
      { order_id: order!.id, seq: 3, label: 'Payment 3', amount_cents: 2000, due_date: nextWeek, status: 'paid' },
    ]);
    const out = await householdOutstanding(famB, torontoToday());
    record('pay page: owed / overdue / next-due math',
      out.owedCents === 4000 && out.overdueCents === 2000 && out.nextDue?.dueDate === yesterday,
      JSON.stringify({ owed: out.owedCents, overdue: out.overdueCents, next: out.nextDue }));

    // ------------------------------------------------ 8. blocked import dedupe
    const csv = [
      'first_name,last_name,email,address',
      'Sarah,Chen,sarah@x.test,1 Main St',
      'Sara,Chen,,1 Main St',
      'Sarah,Chen,,99 Other Rd',
      'Bob,Lee,bob@x.test,2 Elm St',
      'Bob,Lee,bob@x.test,3 Oak Ave',
    ].join('\n');
    const stagedCheck = stageRows(csv);
    const g = (i: number) => stagedCheck.rows[i].dupe_group;
    record('import dedupe: fuzzy same-address grouped, cross-address not, email-exact grouped',
      g(0) !== null && g(0) === g(1) && g(2) === null && g(3) !== null && g(3) === g(4),
      JSON.stringify(stagedCheck.rows.map((r) => r.dupe_group)));

    const allOk = steps.every((s) => s.ok);
    return NextResponse.json({ allOk, steps });
  } catch (err) {
    return NextResponse.json({ allOk: false, steps, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  } finally {
    // ---------------------------------------------------------------- cleanup
    try {
      const famList = familyIds;
      if (famList.length) {
        const { data: orders } = await db.from('program_orders').select('id').in('family_id', famList);
        const oIds = (orders ?? []).map((o) => o.id);
        if (oIds.length) {
          await db.from('program_installments').delete().in('order_id', oIds);
          await db.from('order_addons').delete().in('order_id', oIds);
        }
        await db.from('registrations').delete().in('family_id', famList);
        await db.from('program_orders').delete().in('family_id', famList);
        await db.from('play_points_ledger').delete().in('family_id', famList);
        await db.from('credit_ledger').delete().in('family_id', famList);
        await db.from('family_members').delete().in('family_id', famList);
      }
      if (profileIds.length) {
        await db.from('registrations').delete().in('profile_id', profileIds);
        await db.from('role_assignments').delete().in('profile_id', profileIds);
        await db.from('staff_credit_accounts').delete().in('profile_id', profileIds);
        await db.from('profiles').update({ family_id: null }).in('id', profileIds);
      }
      if (familyIds.length) await db.from('families').delete().in('id', familyIds);
      if (profileIds.length) await db.from('profiles').delete().in('id', profileIds);
      for (const pid of programIds) {
        await db.from('program_sessions').delete().eq('program_id', pid);
        await db.from('registrations').delete().eq('program_id', pid);
        await db.from('programs').delete().eq('id', pid);
      }
    } catch { /* cleanup is best-effort */ }
  }
}
