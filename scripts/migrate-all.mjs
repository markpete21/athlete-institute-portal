#!/usr/bin/env node
/**
 * Apply ALL pending migrations in supabase/migrations/ (sorted order) through
 * the exec_sql RPC. Tracks what has been applied in a `_migrations` table so
 * re-runs only apply new files. Used to bootstrap/refresh the sandbox DB.
 *
 * Usage:
 *   node scripts/migrate-all.mjs                 # target from .env.local
 *   node scripts/migrate-all.mjs --env .env.sandbox
 *   node scripts/migrate-all.mjs --env .env.sandbox --dry-run
 *   node scripts/migrate-all.mjs --mark-applied   # record all as applied
 *                                                 # WITHOUT running them (use
 *                                                 # once on a DB that already
 *                                                 # has the schema, e.g. prod)
 *
 * Prereq (once per NEW Supabase project): paste supabase/migrations/
 * 0000_exec_sql.sql into that project's SQL Editor and run it — exec_sql
 * can't install itself.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1] ?? true;
};
const envFile = flag('--env') || '.env.local';
const dryRun = argv.includes('--dry-run');
const markApplied = argv.includes('--mark-applied');

const env = await readFile(path.join(process.cwd(), envFile), 'utf8');
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim();
const url = get('NEXT_PUBLIC_SUPABASE_URL');
const key = get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) {
  console.error(`Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in ${envFile}`);
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'content-type': 'application/json',
};

async function execSql(query) {
  const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(await res.text());
}

console.log(`Target: ${new URL(url).host}  (env: ${envFile})`);

// Tracking table (idempotent).
await execSql(`
  create table if not exists public._migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  );
  alter table public._migrations enable row level security;
`);

const appliedRes = await fetch(`${url}/rest/v1/_migrations?select=name`, { headers });
if (!appliedRes.ok) throw new Error(await appliedRes.text());
const applied = new Set((await appliedRes.json()).map((r) => r.name));

const dir = path.join(process.cwd(), 'supabase', 'migrations');
const files = (await readdir(dir))
  .filter((f) => f.endsWith('.sql') && !f.startsWith('0000_exec_sql'))
  .sort();

const pending = files.filter((f) => !applied.has(f));
console.log(`${files.length} migrations on disk, ${applied.size} recorded as applied, ${pending.length} pending.`);
if (!pending.length) {
  console.log('Nothing to do.');
  process.exit(0);
}

for (const f of pending) {
  if (dryRun) {
    console.log(`would apply  ${f}`);
    continue;
  }
  if (!markApplied) {
    process.stdout.write(`applying  ${f} ... `);
    const sql = await readFile(path.join(dir, f), 'utf8');
    try {
      await execSql(sql);
    } catch (e) {
      console.log('FAILED');
      console.error(String(e.message ?? e).slice(0, 2000));
      console.error(`\nStopped at ${f}. Earlier files are recorded; fix and re-run.`);
      process.exit(1);
    }
  } else {
    process.stdout.write(`recording  ${f} ... `);
  }
  const rec = await fetch(`${url}/rest/v1/_migrations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: f }),
  });
  if (!rec.ok) {
    console.log('applied, but FAILED to record');
    console.error(await rec.text());
    process.exit(1);
  }
  console.log('ok');
}
console.log(dryRun ? 'Dry run complete.' : 'All migrations applied.');
