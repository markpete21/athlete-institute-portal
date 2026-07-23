import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/**
 * Pill button — the only interactive control shape (Vanguard). `gold` fills
 * with the active brand accent (var(--accent)); `ghost` is a hairline outline.
 * Renders as <a> when `href` is set, else <button>.
 */
type Variant = 'gold' | 'ghost';
type Size = 'md' | 'sm';

const cls = (variant: Variant, size: Size, extra?: string) =>
  [variant === 'gold' ? 'btn-gold' : 'btn-ghost', size === 'sm' ? 'btn-sm' : '', extra ?? '']
    .filter(Boolean)
    .join(' ');

export function Button({
  variant = 'gold',
  size = 'md',
  className,
  children,
  ...rest
}: { variant?: Variant; size?: Size; children: ReactNode } & ComponentProps<'button'>) {
  return (
    <button className={cls(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = 'gold',
  size = 'md',
  className,
  children,
  href,
  ...rest
}: { variant?: Variant; size?: Size; children: ReactNode; href: string } & Omit<
  ComponentProps<typeof Link>,
  'href'
>) {
  return (
    <Link href={href} className={cls(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
