/** tsc emits extensionless relative imports; Node ESM needs .js. Scoped to the lib/site test builds. */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dir = 'lib/site/__compiled__';
for (const f of await readdir(dir)) {
  if (!f.endsWith('.js')) continue;
  const p = path.join(dir, f);
  const src = await readFile(p, 'utf8');
  const out = src.replace(/from '(\.{1,2}\/[^']+?)(?<!\.js)'/g, "from '$1.js'");
  if (out !== src) await writeFile(p, out);
}
