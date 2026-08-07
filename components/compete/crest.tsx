/**
 * Team crest tiles for Compete's scoreboard cards and ticker. Teams don't
 * have logo uploads yet, so the tile is a deterministic monogram: colour and
 * initials derived from the team name, stable across every surface that
 * renders the same team. When team logos land (admin upload, like brand
 * logos), this component grows an `logoUrl` prop and the monogram becomes the
 * fallback — callers won't change.
 */

const CREST_COLORS = [
  '#1E1E1E', // ink
  '#B4483C', // bears red
  '#8E5A3E', // saddle
  '#3E6C8E', // lake blue
  '#4F6B4A', // court green
  '#9E8959', // brand gold
  '#5B5E6B', // slate
  '#6E4A5E', // plum
];

export function crestColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CREST_COLORS[h % CREST_COLORS.length];
}

export function crestCode(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export default function Crest({ name, small }: { name: string; small?: boolean }) {
  return (
    <span
      className={small ? 'cs-crest cs-crest-sm' : 'cs-crest'}
      style={{ background: crestColor(name) }}
      aria-hidden
    >
      {crestCode(name)}
    </span>
  );
}
