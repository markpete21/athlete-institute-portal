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

export default function PlayWordmark({
  variant = 'portal',
  href,
  size = 25,
  className,
}: {
  variant?: WordmarkVariant;
  /** Wraps the lockup in a link when provided. */
  href?: string;
  /** Font size in px for "Play" — everything else scales from it. */
  size?: number;
  className?: string;
}) {
  const inner = (
    <>
      <span className={variant === 'compete' ? 'pw-compete' : 'pw-play'}>{WORDMARK.word[variant]}</span>
      <span className={variant === 'compete' ? 'pw-ball pw-ball-red' : 'pw-ball'}>.</span>
      <span className="pw-qual">{WORDMARK.qualifier[variant]}</span>
    </>
  );
  const style = { fontSize: size } as React.CSSProperties;

  return href ? (
    <Link href={href} className={`pw-lockup${className ? ` ${className}` : ''}`} style={style} aria-label={`${WORDMARK.word[variant]} ${WORDMARK.qualifier[variant]}`}>
      {inner}
    </Link>
  ) : (
    <span className={`pw-lockup${className ? ` ${className}` : ''}`} style={style} aria-label={`${WORDMARK.word[variant]} ${WORDMARK.qualifier[variant]}`}>
      {inner}
    </span>
  );
}
