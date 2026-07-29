/**
 * Export the Play lockups as standalone SVG files and upload them to the PUBLIC
 * brand-assets bucket, so the other Athlete Institute apps (live stream,
 * tickets, apps hub, dashboard) can render the same wordmark without copying
 * CSS.
 *
 *   node scripts/export-wordmarks.mjs
 *
 * Values MUST stay in sync with components/brand/PlayWordmark.tsx — that
 * component is the source of truth for the on-site lockup; this script mirrors
 * it into files for everyone else. Text is converted to nothing clever: we ship
 * the fonts by reference AND a path-free <text> version, because a consumer app
 * that already loads Inter + JetBrains Mono (all of ours do) renders it exactly.
 */
import { readFileSync } from 'node:fs';

const RED = '#d2232a';
const GOLD = '#9e8959';
const SILVER = '#9b9891';
const BUCKET = 'brand-assets';

function env() {
  const out = {};
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    out[t.slice(0, i)] = t.slice(i + 1).replace(/^"|"$/g, '');
  }
  return out;
}

/** One lockup as SVG. `onDark` picks the qualifier colour that reads on the ground. */
function lockup(qualifier, { onDark = true, word = 'Play' } = {}) {
  const q = qualifier.toUpperCase();
  // Compete inverts the colours: gold word, red ball.
  const isCompete = word === 'Compete';
  const wordFill = isCompete ? GOLD : RED;
  const ballFill = isCompete ? RED : GOLD;
  const playW = word.length * 23, ballW = 16, qualSize = 18.8, qualTrack = 6.8;
  const qualW = q.length * (qualSize * 0.6 + qualTrack);
  const total = Math.ceil(playW + ballW + 10 + qualW);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} 56" width="${total}" height="56" role="img" aria-label="${word} ${qualifier}">
  <title>${word} ${qualifier}</title>
  <g font-family="Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif">
    <text x="0" y="40" font-size="40" font-weight="900" letter-spacing="-0.8" fill="${wordFill}">${word}</text>
    <text x="${playW}" y="40" font-size="48.8" font-weight="900" fill="${ballFill}">.</text>
  </g>
  <text x="${playW + ballW + 10}" y="40" font-family="'JetBrains Mono', ui-monospace, monospace"
        font-size="${qualSize}" font-weight="500" letter-spacing="${qualTrack}"
        fill="${onDark ? SILVER : '#6b6760'}">${q}</text>
</svg>`;
}

const FILES = [
  { path: 'play/wordmark-portal.svg', body: lockup('Portal') },
  { path: 'play/wordmark-admin.svg', body: lockup('Admin') },
  { path: 'play/wordmark-portal-light.svg', body: lockup('Portal', { onDark: false }) },
  { path: 'play/wordmark-admin-light.svg', body: lockup('Admin', { onDark: false }) },
  { path: 'play/wordmark-compete.svg', body: lockup('Portal', { word: 'Compete' }) },
  { path: 'play/wordmark-compete-light.svg', body: lockup('Portal', { word: 'Compete', onDark: false }) },
];

// Raw storage HTTP API: supabase-js pulls in realtime, which needs a WebSocket
// global that Node 20 doesn't provide.
const e = env();
const base = e.NEXT_PUBLIC_SUPABASE_URL;
const key = e.SUPABASE_SERVICE_ROLE_KEY;

for (const f of FILES) {
  const res = await fetch(`${base}/storage/v1/object/${BUCKET}/${f.path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      apikey: key,
      'content-type': 'image/svg+xml',
      'x-upsert': 'true',
    },
    body: f.body,
  });
  if (!res.ok) {
    console.error(`FAILED ${f.path}: ${res.status} ${await res.text()}`);
    process.exitCode = 1;
    continue;
  }
  console.log(`uploaded ${f.path}\n  -> ${base}/storage/v1/object/public/${BUCKET}/${f.path}`);
}
