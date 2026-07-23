import 'server-only';
import { randomUUID } from 'node:crypto';
import { audit, parseCsv } from '@ai/foundation';
import { notify } from '@ai/foundation/notify';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Playbook import (Module 1 Stage 5) — a staged, reviewable job. Nothing
 * touches real tables until commit.
 *
 * CSV schema (docs/playbook-import.md): first_name, last_name, email, phone,
 * address, city, postal, dob, household_key — extra columns are preserved in
 * `raw`. Household grouping: household_key when present, else derived from
 * normalized address + last name.
 *
 * Dedupe (spec): exact normalized-email match first, then name+address fuzzy
 * (normalized name Levenshtein ≤ 2 with the same address token). Suspects
 * share a dupe_group for the admin review UI (merge / keep-separate).
 */

export interface ImportRow {
  id: number;
  row_num: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal: string | null;
  dob: string | null;
  household_key: string | null;
  dupe_group: number | null;
  resolution: 'new' | 'merge' | 'skip';
  merge_into: number | null;
}

const norm = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Levenshtein distance (small strings only). */
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

interface StagedRow {
  row_num: number;
  raw: Record<string, string>;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal: string | null;
  dob: string | null;
  household_key: string | null;
  dupe_group: number | null;
}

/** Pure: parse + normalize + derive households + group duplicates. */
export function stageRows(csvText: string): { rows: StagedRow[]; dupeGroups: number } {
  const { rows } = parseCsv(csvText);
  const staged: StagedRow[] = rows.map((raw, i) => {
    // Emails keep their real characters — lowercase/trim only (norm() is for
    // fuzzy name/address matching and would strip @ and dots).
    const email = (raw.email ?? '').trim().toLowerCase() || null;
    const addressNorm = norm(raw.address);
    return {
      row_num: i + 1,
      raw,
      first_name: raw.first_name?.trim() || null,
      last_name: raw.last_name?.trim() || null,
      email,
      phone: raw.phone?.trim() || null,
      address: raw.address?.trim() || null,
      city: raw.city?.trim() || null,
      postal: raw.postal?.trim().toUpperCase().replace(/\s+/g, '') || null,
      dob: /^\d{4}-\d{2}-\d{2}$/.test(raw.dob ?? '') ? raw.dob : null,
      household_key:
        raw.household_key?.trim() ||
        (addressNorm && raw.last_name ? `${norm(raw.last_name)}@${addressNorm}` : null),
      dupe_group: null,
    };
  });

  // Group duplicates: email exact → name+address fuzzy.
  let nextGroup = 1;
  const groupOf = new Map<number, number>(); // row index -> group
  const assign = (a: number, b: number) => {
    const g = groupOf.get(a) ?? groupOf.get(b) ?? nextGroup++;
    groupOf.set(a, g);
    groupOf.set(b, g);
  };

  for (let i = 0; i < staged.length; i++) {
    for (let j = i + 1; j < staged.length; j++) {
      const A = staged[i], B = staged[j];
      if (A.email && B.email && A.email === B.email) { assign(i, j); continue; }
      const nameA = norm(`${A.first_name} ${A.last_name}`);
      const nameB = norm(`${B.first_name} ${B.last_name}`);
      const addrSame = !!A.address && norm(A.address) === norm(B.address);
      if (nameA && nameB && addrSame && levenshtein(nameA, nameB) <= 2) assign(i, j);
    }
  }
  groupOf.forEach((g, idx) => { staged[idx].dupe_group = g; });

  return { rows: staged, dupeGroups: new Set(groupOf.values()).size };
}

/** Create the job + rows in the DB (the dry-run artifact the admin reviews). */
export async function createImportJob(filename: string, csvText: string, actorClerkId: string) {
  const db = supabaseAdmin();
  const { rows, dupeGroups } = stageRows(csvText);
  if (rows.length === 0) throw new Error('No rows found in that CSV.');

  const { data: job, error } = await db
    .from('import_jobs')
    .insert({ filename, row_count: rows.length, dupe_groups: dupeGroups, created_by: actorClerkId })
    .select('id')
    .single();
  if (error) throw new Error(`job create failed: ${error.message}`);

  const { error: e2 } = await db.from('import_rows').insert(
    rows.map((r) => ({ job_id: job.id, ...r })),
  );
  if (e2) throw new Error(`rows stage failed: ${e2.message}`);

  await audit({ actorId: actorClerkId, action: 'import.staged', target: `import_job:${job.id}`, meta: { filename, rows: rows.length, dupeGroups } });
  return { jobId: job.id as number, rowCount: rows.length, dupeGroups };
}

/** Admin review decision for a row. */
export async function resolveRow(rowId: number, resolution: 'new' | 'merge' | 'skip', mergeInto?: number) {
  const { error } = await supabaseAdmin()
    .from('import_rows')
    .update({ resolution, merge_into: resolution === 'merge' ? (mergeInto ?? null) : null })
    .eq('id', rowId);
  if (error) throw new Error(`resolve failed: ${error.message}`);
}

/**
 * COMMIT: materialize the reviewed job — households (by household_key),
 * family_members for every kept row, and an UNCLAIMED profile for each kept
 * row with an email (clerk_user_id 'unclaimed:<token>'). Claim emails go out
 * via notify() (skipped while Resend is keyless). Idempotent guard: job must
 * be 'staged'.
 */
export async function commitImportJob(jobId: number, actorClerkId: string, appUrl: string) {
  const db = supabaseAdmin();
  const { data: job, error: jErr } = await db
    .from('import_jobs').select('id, status').eq('id', jobId).single();
  if (jErr) throw new Error(jErr.message);
  if (job.status !== 'staged') throw new Error(`Job is ${job.status}, not staged.`);

  const { data: rowsRaw, error } = await db
    .from('import_rows')
    .select('id, row_num, first_name, last_name, email, phone, address, city, postal, dob, household_key, dupe_group, resolution, merge_into')
    .eq('job_id', jobId)
    .order('row_num');
  if (error) throw new Error(error.message);
  const rows = (rowsRaw ?? []) as ImportRow[];

  const kept = rows.filter((r) => r.resolution === 'new');
  let familiesMade = 0, membersMade = 0, profilesMade = 0;

  // Households: group kept rows by household_key (rows without one become
  // single-member households).
  const households = new Map<string, ImportRow[]>();
  for (const r of kept) {
    const key = r.household_key ?? `solo:${r.id}`;
    households.set(key, [...(households.get(key) ?? []), r]);
  }

  for (const [, members] of households) {
    // HoH = first adult-looking member (has email), else first member.
    const hoh = members.find((m) => m.email) ?? members[0];
    const famName = `${hoh.last_name ?? 'Imported'} Household`;
    const { data: fam, error: fErr } = await db
      .from('families').insert({ name: famName }).select('id').single();
    if (fErr) throw new Error(`family create failed: ${fErr.message}`);
    familiesMade++;

    for (const m of members) {
      let profileId: number | null = null;
      if (m.email) {
        // Existing account with this email? Link instead of duplicating.
        const { data: existing } = await db.from('profiles').select('id').eq('email', m.email).maybeSingle();
        if (existing) {
          profileId = existing.id;
        } else {
          const token = randomUUID();
          const { data: prof, error: pErr } = await db
            .from('profiles')
            .insert({
              clerk_user_id: `unclaimed:${token}`,
              email: m.email,
              first_name: m.first_name,
              last_name: m.last_name,
              phone: m.phone,
              family_id: fam.id,
              claim_token: token,
              imported_from: `playbook:${jobId}`,
            })
            .select('id')
            .single();
          if (pErr) throw new Error(`profile create failed (row ${m.row_num}): ${pErr.message}`);
          profileId = prof.id;
          profilesMade++;
        }
      }

      const isHoh = m.id === hoh.id;
      const { error: mErr } = await db.from('family_members').insert({
        family_id: fam.id,
        profile_id: profileId,
        first_name: m.first_name ?? '—',
        last_name: m.last_name ?? '—',
        dob: m.dob,
        email: m.email,
        member_role: isHoh ? 'hoh' : m.dob ? 'dependent' : 'adult',
      });
      if (mErr) throw new Error(`member create failed (row ${m.row_num}): ${mErr.message}`);
      membersMade++;

      if (isHoh && profileId) {
        await db.from('families').update({ hoh_profile_id: profileId }).eq('id', fam.id);
      }
    }
  }

  await db.from('import_jobs').update({
    status: 'committed',
    committed_families: familiesMade,
    committed_members: membersMade,
    committed_profiles: profilesMade,
  }).eq('id', jobId);

  await audit({
    actorId: actorClerkId,
    action: 'import.committed',
    target: `import_job:${jobId}`,
    meta: { familiesMade, membersMade, profilesMade },
  });

  return { familiesMade, membersMade, profilesMade };
}

/** Send (or re-send) claim emails for a committed job's unclaimed profiles. */
export async function sendClaimEmails(jobId: number, appUrl: string) {
  const db = supabaseAdmin();
  const { data: profiles, error } = await db
    .from('profiles')
    .select('id, email, first_name, claim_token')
    .eq('imported_from', `playbook:${jobId}`)
    .is('claimed_at', null);
  if (error) throw new Error(error.message);

  let sent = 0, skipped = 0;
  for (const p of profiles ?? []) {
    if (!p.email || !p.claim_token) { skipped++; continue; }
    const res = await notify({
      to: { email: p.email },
      channels: ['email'],
      template: 'generic',
      data: {
        heading: 'Claim your Athlete Institute account',
        body: `${p.first_name ?? 'Hi'}, your Athlete Institute account has moved to our new portal. Claim it to manage registrations, schedules and payments — it takes a minute.`,
        ctaLabel: 'Claim my account',
        ctaUrl: `${appUrl}/sign-up?claim=${p.claim_token}`,
      },
    });
    res.ok ? sent++ : skipped++;
  }
  return { sent, skipped, total: (profiles ?? []).length };
}

/**
 * Claim adoption: called on sign-in (see lib/profile.ts) — an unclaimed
 * profile with the same email is adopted by the new Clerk identity instead of
 * creating a duplicate.
 */
export async function adoptUnclaimedProfile(clerkUserId: string, email: string): Promise<number | null> {
  const db = supabaseAdmin();
  const { data: unclaimed } = await db
    .from('profiles')
    .select('id')
    .eq('email', email.toLowerCase())
    .like('clerk_user_id', 'unclaimed:%')
    .maybeSingle();
  if (!unclaimed) return null;

  const { error } = await db
    .from('profiles')
    .update({ clerk_user_id: clerkUserId, claimed_at: new Date().toISOString() })
    .eq('id', unclaimed.id);
  if (error) throw new Error(`claim adoption failed: ${error.message}`);
  await audit({
    actorId: clerkUserId,
    action: 'profile.claimed',
    target: `profile:${unclaimed.id}`,
    meta: { email },
  });
  return unclaimed.id;
}
