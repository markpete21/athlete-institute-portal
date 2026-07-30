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

/**
 * Compete's period is a bracket the ball plays through: it rests as the period,
 * advances along the bottom feed, up the connector and out the stem, holds the
 * win, then fades back. SMIL so it animates even when consumed as an <img>.
 * Mirrors CompeteBracket in components/brand/PlayWordmark.tsx (shorter here to
 * fit the 56px lockup box).
 */
function bracket(x0, ballFill, onDark) {
  const bot = 35.6, top = 6, mid = (top + bot) / 2;
  const join = x0 + 20, end = x0 + 38;
  const keys = '0;0.30;0.42;0.52;0.62;0.86;0.92;0.925;0.98;1';
  // period -> along the bottom feed -> up the connector -> out the stem -> back
  const cx = [x0, x0, join, join, end, end, end, x0, x0, x0].join(';');
  const cy = [bot, bot, bot, mid, mid, mid, mid, bot, bot, bot].join(';');
  return `<g fill="none" stroke="${onDark ? SILVER : '#1e1e1e'}" stroke-width="1.6" stroke-linecap="square">
    <path d="M${x0 + 2} ${top} H${join}"/>
    <path d="M${x0 + 2} ${bot} H${join}"/>
    <path d="M${join} ${top} V${bot}"/>
    <path d="M${join} ${mid} H${end}"/>
  </g>
  <circle cx="${x0}" cy="${bot}" r="4.4" fill="${ballFill}">
    <animate attributeName="cx" values="${cx}" keyTimes="${keys}" dur="5s" repeatCount="indefinite"/>
    <animate attributeName="cy" values="${cy}" keyTimes="${keys}" dur="5s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="1;1;1;1;1;1;0;0;1;1" keyTimes="${keys}" dur="5s" repeatCount="indefinite"/>
  </circle>`;
}

/**
 * Play's period DRIBBLES — the same motion as .pw-ball / @keyframes pw-dribble in
 * globals.css: up to the cap height of the "Pl", squash on the landing, a second
 * bounce at half height, then rest. 1.7s loop, SMIL so it animates as an <img>.
 *
 * The CSS moves the ball in its OWN em (it renders at 1.22em of the lockup), so
 * -0.607em / -0.303em become -29.6 / -14.8 at this 48.8px period. Two nested
 * <g>s: the outer one travels, the inner one squashes about the baseline — one
 * animateTransform each, so neither has to be additive.
 */
function dribble(x, ballFill) {
  const keys = '0;0.12;0.24;0.3;0.42;0.52;0.58;1';
  const rise = [0, -29.6, 0, 0, -14.8, 0, 0, 0].map((v) => `0 ${v}`).join(';');
  const squash = [1, 1.06, 0.86, 1, 1, 0.93, 1, 1].map((v) => `1 ${v}`).join(';');
  // ease-in-out per interval, matching the CSS timing function.
  const ease = new Array(keys.split(';').length - 1).fill('0.42 0 0.58 1').join(';');
  const anim = (type, values) =>
    `<animateTransform attributeName="transform" type="${type}" values="${values}"` +
    ` keyTimes="${keys}" calcMode="spline" keySplines="${ease}" dur="1.7s" repeatCount="indefinite"/>`;
  return `<g transform="translate(${x},40)">
    <g>${anim('translate', rise)}
      <g>${anim('scale', squash)}
        <text class="pw-w" x="0" y="0" font-size="48.8" font-weight="900" fill="${ballFill}">.</text>
      </g>
    </g>
  </g>`;
}

/** One lockup as SVG. `onDark` picks the qualifier colour that reads on the ground. */
function lockup(qualifier, { onDark = true, word = 'Play' } = {}) {
  const q = qualifier.toUpperCase();
  // Compete inverts the colours: gold word, red ball.
  const isCompete = word === 'Compete';
  const wordFill = isCompete ? GOLD : RED;
  const ballFill = isCompete ? RED : GOLD;
  // Where the period (or bracket) starts. The per-char estimate is fine for
  // "Play"; "Compete" is long enough that it needs its real advance width
  // (measured from Inter 900 at this size), or the ball lands on the final "e".
  const playW = word === 'Compete' ? 176 : word.length * 23;
  // The period tucks in tight against the word (Play); Compete's bracket keeps
  // its breathing room. The qualifier then follows whatever the period does.
  const dotX = isCompete ? playW + 6 : playW - 9;
  const ballW = isCompete ? 44 : 16, qualSize = 14.5, qualTrack = 5.2;
  const qualX = dotX + ballW + 10;
  const qualW = q.length * (qualSize * 0.6 + qualTrack);
  const total = Math.ceil(qualX + qualW);
  const ball = isCompete ? bracket(dotX, ballFill, onDark) : dribble(dotX, ballFill);
  // Fonts come from CSS vars FIRST so a consumer that inlines this SVG renders it
  // in its own loaded Inter / JetBrains Mono (next/font hashes the family name, so
  // the literal names never match). Inside an <img> the vars are undefined and it
  // falls back to the literal families — same result as before. A <style> block
  // beats presentation attributes, which is why the families live here.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} 56" width="${total}" height="56" role="img" aria-label="${word} ${qualifier}">
  <title>${word} ${qualifier}</title>
  <style>
    .pw-w { font-family: var(--font-display), Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif }
    .pw-q { font-family: var(--font-mono), 'JetBrains Mono', ui-monospace, monospace }
  </style>
  <text class="pw-w" x="0" y="40" font-size="40" font-weight="900" letter-spacing="-0.8" fill="${wordFill}">${word}</text>
  ${ball}
  <text class="pw-q" x="${qualX}" y="40"
        font-size="${qualSize}" font-weight="500" letter-spacing="${qualTrack}"
        fill="${onDark ? SILVER : '#6b6760'}">${q}</text>
</svg>`;
}

// NOTE: the `-portal` filenames (and the manifest's `wordmarks.portal` key) are
// historical — the qualifier now reads APP. Consumers key off those paths, so the
// names stay put; only the rendered lockup changed.
const FILES = [
  { path: 'play/wordmark-portal.svg', body: lockup('App') },
  { path: 'play/wordmark-admin.svg', body: lockup('Admin') },
  { path: 'play/wordmark-portal-light.svg', body: lockup('App', { onDark: false }) },
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
