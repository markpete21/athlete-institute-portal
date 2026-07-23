/**
 * tsc emits extensionless relative imports ("./facility-tree"), which Node ESM
 * refuses. Append .js so the compiled test harness modules resolve.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dir = 'packages/foundation/src/__compiled__';
for (const f of await readdir(dir)) {
  if (!f.endsWith('.js')) continue;
  const p = path.join(dir, f);
  const src = await readFile(p, 'utf8');
  const out = src.replace(/from '(\.\/[^']+?)(?<!\.js)'/g, "from '$1.js'");
  if (out !== src) await writeFile(p, out);
}
