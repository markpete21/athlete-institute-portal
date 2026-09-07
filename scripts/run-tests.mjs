#!/usr/bin/env node
/**
 * Run every `test:*` script in package.json sequentially and fail on the first
 * red suite. `npm test` locally and in CI — one command, no list to keep in sync.
 */
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const suites = Object.keys(pkg.scripts).filter((k) => k.startsWith('test:')).sort();
let failed = 0;
for (const name of suites) {
  process.stdout.write(`\n=== ${name}\n`);
  const res = spawnSync('npm', ['run', '-s', name], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (res.status !== 0) failed += 1;
}
console.log(`\n${suites.length - failed}/${suites.length} suites passed`);
process.exit(failed ? 1 : 0);
