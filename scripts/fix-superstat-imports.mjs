/** tsc emits extensionless relative imports; Node ESM needs .js. Scoped to the Superstat test build. */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (e.name.endsWith('.js')) {
      const src = await readFile(p, 'utf8');
      const out = src.replace(/from '(\.{1,2}\/[^']+?)(?<!\.js)'/g, "from '$1.js'");
      if (out !== src) await writeFile(p, out);
    }
  }
}
await walk('lib/superstat/__compiled__');
