import { supabaseAdmin } from '@ai/foundation/supabase';
import { commitJobAction, resolveRowAction, sendClaimEmailsAction, uploadCsvAction } from './actions';

export const dynamic = 'force-dynamic';

interface JobRow {
  id: number; filename: string; status: string; row_count: number; dupe_groups: number;
  committed_families: number | null; committed_members: number | null; committed_profiles: number | null;
  created_at: string;
}
interface StagedRow {
  id: number; row_num: number; first_name: string | null; last_name: string | null;
  email: string | null; address: string | null; dob: string | null;
  household_key: string | null; dupe_group: number | null; resolution: string; merge_into: number | null;
}

/**
 * Playbook import (Module 1 Stage 5): staged, reviewable, then committed.
 * Upload a CSV → review flagged duplicates (merge/keep/skip) → commit →
 * send claim emails. See docs/playbook-import.md for the CSV schema.
 */
export default async function ImportAdminPage() {
  const db = supabaseAdmin();
  const { data: jobs } = await db
    .from('import_jobs')
    .select('id, filename, status, row_count, dupe_groups, committed_families, committed_members, committed_profiles, created_at')
    .order('id', { ascending: false })
    .limit(10);

  const staged = ((jobs ?? []) as JobRow[]).find((j) => j.status === 'staged');
  let dupeRows: StagedRow[] = [];
  if (staged) {
    const { data } = await db
      .from('import_rows')
      .select('id, row_num, first_name, last_name, email, address, dob, household_key, dupe_group, resolution, merge_into')
      .eq('job_id', staged.id)
      .not('dupe_group', 'is', null)
      .order('dupe_group')
      .order('row_num');
    dupeRows = (data ?? []) as StagedRow[];
  }

  const groups = new Map<number, StagedRow[]>();
  for (const r of dupeRows) groups.set(r.dupe_group!, [...(groups.get(r.dupe_group!) ?? []), r]);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <p className="label text-[11px]">Admin · Accounts</p>
        <h1 className="text-5xl">
          Playbook import<span style={{ color: 'var(--accent)' }}>.</span>
        </h1>
        <p className="text-body">
          Staged and reviewable — nothing is written to real accounts until you commit.
        </p>
      </header>

      <section className="card flex flex-col gap-4 p-6">
        <h2 className="text-2xl">Upload export</h2>
        <form action={uploadCsvAction} className="flex items-end gap-3">
          <div className="flex-1">
            <label className="field-label" htmlFor="csv">Playbook CSV</label>
            <input id="csv" name="csv" type="file" accept=".csv,text/csv" className="input" />
          </div>
          <button type="submit" className="btn-gold">Stage import</button>
        </form>
        <p className="text-sm text-silver">
          Expected columns: first_name, last_name, email, phone, address, city, postal, dob, household_key
          (extras are kept). Migrates people + households only — never payment methods or history.
        </p>
      </section>

      {staged && (
        <section className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-2xl">Review: {staged.filename}</h2>
            <span className="tag">{staged.row_count} rows · {staged.dupe_groups} duplicate groups</span>
          </div>

          {groups.size === 0 && <p className="text-body">No suspected duplicates — ready to commit.</p>}

          {[...groups.entries()].map(([g, rows]) => (
            <div key={g} className="card flex flex-col gap-3 p-5">
              <p className="label text-[11px]">Duplicate group {g}</p>
              {rows.map((r) => (
                <form key={r.id} action={resolveRowAction} className="flex flex-wrap items-center gap-3 border-b border-hairline pb-2 text-sm">
                  <input type="hidden" name="rowId" value={r.id} />
                  <span className="text-ink">{r.first_name} {r.last_name}</span>
                  <span className="text-silver">{r.email ?? 'no email'}</span>
                  <span className="text-silver">{r.address ?? ''}</span>
                  <span className="tag">{r.resolution}{r.merge_into ? ` → row ${r.merge_into}` : ''}</span>
                  <span className="flex-1" />
                  <select name="resolution" defaultValue={r.resolution} className="input max-w-32">
                    <option value="new">Keep separate</option>
                    <option value="merge">Merge away</option>
                    <option value="skip">Skip</option>
                  </select>
                  <select name="mergeInto" defaultValue={r.merge_into ?? ''} className="input max-w-36">
                    <option value="">merge into…</option>
                    {rows.filter((x) => x.id !== r.id).map((x) => (
                      <option key={x.id} value={x.id}>row {x.row_num}: {x.first_name} {x.last_name}</option>
                    ))}
                  </select>
                  <button type="submit" className="btn-ghost btn-sm">Save</button>
                </form>
              ))}
            </div>
          ))}

          <form action={commitJobAction}>
            <input type="hidden" name="jobId" value={staged.id} />
            <button type="submit" className="btn-gold">Commit import</button>
          </form>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Jobs</h2>
        <table className="data-table">
          <thead>
            <tr><th>File</th><th>Status</th><th>Rows</th><th>Committed</th><th /></tr>
          </thead>
          <tbody>
            {((jobs ?? []) as JobRow[]).map((j) => (
              <tr key={j.id}>
                <td className="text-ink">{j.filename}</td>
                <td><span className="tag">{j.status}</span></td>
                <td className="mono">{j.row_count}</td>
                <td className="mono">
                  {j.status === 'committed'
                    ? `${j.committed_families} fam · ${j.committed_members} mem · ${j.committed_profiles} prof`
                    : '—'}
                </td>
                <td>
                  {j.status === 'committed' && (
                    <form action={sendClaimEmailsAction}>
                      <input type="hidden" name="jobId" value={j.id} />
                      <button type="submit" className="btn-ghost btn-sm">Send claim emails</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
