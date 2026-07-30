import Link from 'next/link';

/**
 * THE Play lockup — one source of truth for every surface (public shell, admin
 * shell, auth pages, and the exported SVG in the brand manifest).
 *
 *   Play  = Inter 900, All Canadian red (#D2232A)
 *   .     = gold, dribbling (respects prefers-reduced-motion)
 *   PORTAL / ADMIN = JetBrains Mono, uppercase, tracked, silver — the house
 *                    label treatment, so the qualifier never competes with the
 *                    product name.
 *
 * If this changes, change it HERE: the shells and the auth pages all render this
 * component, and scripts/export-wordmarks.mjs mirrors the same values into the
 * SVG files other apps consume.
 */
export type WordmarkVariant = 'portal' | 'admin' | 'compete';

export const WORDMARK = {
  red: '#d2232a',
  gold: '#9e8959',
  silver: '#9b9891',
  qualifier: { portal: 'Portal', admin: 'Admin', compete: 'Portal' } as Record<WordmarkVariant, string>,
  /** The word before the dot. Compete inverts the colours: gold word, red ball. */
  word: { portal: 'Play', admin: 'Play', compete: 'Compete' } as Record<WordmarkVariant, string>,
} as const;

/**
 * Compete's period is a BRACKET, not a dribble: two feed lines into a vertical
 * connector plus a stem, with the red ball resting as the period and then
 * advancing along the bracket to the end of the stem — the winner coming out
 * of the draw. Geometry is in units of 100 = 1em, so it scales with the lockup.
 * Motion + line colour live in globals.css (.pw-bracket) so reduced-motion and
 * dark grounds can override them.
 */
function CompeteBracket() {
  return (
    <svg className="pw-bracket" viewBox="-12 -114 120 120" aria-hidden focusable="false">
      <g className="pwb-line">
        <path d="M5 -108 H53" />
        <path d="M5 -11 H53" />
        <path d="M53 -108 V-11" />
        <path d="M53 -59.5 H95" />
      </g>
      <circle className="pwb-ball" cx="0" cy="-11" r="11" />
    </svg>
  );
}

export default function PlayWordmark({
  variant = 'portal',
  href,
  size = 25,
  className,
  qualifier,
}: {
  variant?: WordmarkVariant;
  /** Wraps the lockup in a link when provided. */
  href?: string;
  /** Font size in px for "Play" — everything else scales from it. */
  size?: number;
  className?: string;
  /** Replaces the variant's qualifier (e.g. "Login" on a sign-in link). */
  qualifier?: string;
}) {
  const qual = qualifier ?? WORDMARK.qualifier[variant];
  const inner = (
    <>
      <span className={variant === 'compete' ? 'pw-compete' : 'pw-play'}>{WORDMARK.word[variant]}</span>
      {variant === 'compete' ? (
        <CompeteBracket />
      ) : (
        <span className="pw-ball">.</span>
      )}
      <span className="pw-qual">{qual}</span>
    </>
  );
  const style = { fontSize: size } as React.CSSProperties;

  return href ? (
    <Link href={href} className={`pw-lockup${className ? ` ${className}` : ''}`} style={style} aria-label={`${WORDMARK.word[variant]} ${qual}`}>
      {inner}
    </Link>
  ) : (
    <span className={`pw-lockup${className ? ` ${className}` : ''}`} style={style} aria-label={`${WORDMARK.word[variant]} ${qual}`}>
      {inner}
    </span>
  );
}
