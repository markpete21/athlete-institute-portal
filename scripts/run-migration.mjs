#!/usr/bin/env node
/**
 * Apply a migration file through the exec_sql RPC (bootstrap: 0000_exec_sql.sql
 * pasted once in the SQL Editor). Usage:
 *   node scripts/run-migration.mjs supabase/migrations/0014_xxx.sql
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
 * The whole file is sent as ONE statement batch (execute runs it atomically
 * inside a single transaction - same semantics as the SQL Editor).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/run-migration.mjs <migration.sql>');
  process.exit(1);
}

const env = await readFile(path.join(process.cwd(), '.env.local'), 'utf8');
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim();
const url = get('NEXT_PUBLIC_SUPABASE_URL');
const key = get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const sql = await readFile(file, 'utf8');
const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
});

if (!res.ok) {
  const body = await res.text();
  console.error(`FAILED (${res.status}): ${body}`);
  process.exit(1);
}
console.log(`applied: ${path.basename(file)}`);
