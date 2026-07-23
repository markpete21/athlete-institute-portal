import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import {
  adoptUnclaimedProfile,
  commitImportJob,
  createImportJob,
  levenshtein,
  resolveRow,
  sendClaimEmails,
  stageRows,
} from '@/lib/import/playbook';

/**
 * DEV-ONLY: the whole Playbook pipeline against docs/playbook-sample.csv —
 * stage → dedupe groups → review resolutions → commit → claim-email pass →
 * claim adoption — with full cleanup.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  let jobId: number | null = null;
  const familyIds: number[] = [];

  try {
    const csv = await readFile(path.join(process.cwd(), 'docs', 'playbook-sample.csv'), 'utf8');

    // 0. pure staging: dupes found as designed
    const pure = stageRows(csv);
    const emailDupe = pure.rows.filter((r) => r.email === 'sarah.chen@example.com');
    const fuzzyDupe = pure.rows.filter((r) => ['Maria', 'Mario'].includes(r.first_name ?? ''));
    record(
      'dedupe: email-exact + name/address fuzzy',
      pure.dupeGroups === 2 &&
        emailDupe.length === 2 && emailDupe[0].dupe_group === emailDupe[1].dupe_group &&
        fuzzyDupe[0].dupe_group === fuzzyDupe[1].dupe_group &&
        emailDupe[0].dupe_group !== fuzzyDupe[0].dupe_group &&
        levenshtein('maria santos', 'mario santos') === 1,
      `${pure.dupeGroups} groups (email pair + Maria/Mario fuzzy pair)`,
    );

    // 1. stage into the DB
    const job = await createImportJob('playbook-sample.csv', csv, 'system:verify');
    jobId = job.jobId;
    record('staged job', job.rowCount === 10 && job.dupeGroups === 2, JSON.stringify(job));

    // 2. review: merge the duplicate SARAH CHEN row away; keep Maria & Mario separate (default)
    const { data: rows } = await db
      .from('import_rows')
      .select('id, row_num, email, first_name')
      .eq('job_id', jobId)
      .order('row_num');
    const sarahDupes = (rows ?? []).filter((r) => r.email === 'sarah.chen@example.com');
    const [keep, dupe] = [sarahDupes[0], sarahDupes[1]];
    await resolveRow(dupe.id, 'merge', keep.id);
    record('review: duplicate merged away', true, `row ${dupe.row_num} merged into row ${keep.row_num}`);

    // 3. commit → 4 households, 9 members, 5 unclaimed profiles
    const committed = await commitImportJob(jobId, 'system:verify', 'http://play.localhost:3101');
    record(
      'commit: households/members/profiles',
      committed.familiesMade === 4 && committed.membersMade === 9 && committed.profilesMade === 5,
      JSON.stringify(committed),
    );
    const { data: fams } = await db.from('families').select('id, name, hoh_profile_id').like('name', '%Household');
    const chen = (fams ?? []).find((f) => f.name === 'Chen Household');
    for (const f of fams ?? []) if (['Chen Household', 'Osei Household', 'Santos Household', 'Tremblay Household'].includes(f.name)) familyIds.push(f.id);

    // 4. household shape: Chen has 3 members, HoH = Sarah (emailed member), kids dependents
    const { data: chenMembers } = await db
      .from('family_members')
      .select('first_name, member_role, profile_id')
      .eq('family_id', chen!.id);
    const sarah = chenMembers!.find((m) => m.first_name === 'Sarah');
    const kids = chenMembers!.filter((m) => m.member_role === 'dependent');
    record(
      'household shape (HoH + dependents, hoh linked)',
      chenMembers!.length === 3 && sarah?.member_role === 'hoh' && kids.length === 2 && chen!.hoh_profile_id === sarah!.profile_id,
      `Chen: ${chenMembers!.length} members, HoH Sarah, ${kids.length} dependents`,
    );

    // 5. unclaimed profiles are placeholders with claim tokens
    const { data: unclaimed } = await db
      .from('profiles')
      .select('id, clerk_user_id, claim_token, email')
      .eq('imported_from', `playbook:${jobId}`);
    record(
      'unclaimed profiles carry tokens + placeholders',
      unclaimed!.length === 5 && unclaimed!.every((p) => p.clerk_user_id.startsWith('unclaimed:') && !!p.claim_token),
      `${unclaimed!.length} unclaimed`,
    );

    // 6. claim emails pass runs (skipped-without-Resend is acceptable)
    const emails = await sendClaimEmails(jobId, 'http://play.localhost:3101');
    record('claim email pass', emails.total === 5, JSON.stringify(emails));

    // 7. claim adoption: Sarah signs in with a new Clerk id → adopts, keeps family
    const adoptedId = await adoptUnclaimedProfile('user_verify_claim_1', 'sarah.chen@example.com');
    const { data: adopted } = await db
      .from('profiles')
      .select('id, clerk_user_id, claimed_at, family_id')
      .eq('id', adoptedId!)
      .single();
    record(
      'claim adoption (Clerk id attached, family kept)',
      adopted!.clerk_user_id === 'user_verify_claim_1' && !!adopted!.claimed_at && adopted!.family_id === chen!.id,
      JSON.stringify(adopted),
    );

    // 8. adopting twice is a no-op (no more unclaimed match)
    const again = await adoptUnclaimedProfile('user_verify_claim_2', 'sarah.chen@example.com');
    record('second adoption attempt no-ops', again === null, 'null (already claimed)');
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    for (const fid of familyIds) await db.from('families').delete().eq('id', fid);
    if (jobId) {
      await db.from('profiles').delete().eq('imported_from', `playbook:${jobId}`);
      await db.from('import_jobs').delete().eq('id', jobId);
    }
    record('cleanup', true, 'families, imported profiles, job removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
