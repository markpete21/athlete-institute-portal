/**
 * Brand theming (Module 0 §5) — PURE, edge-safe.
 *
 * The portal serves several sub-brands under one shared design system (the
 * Orangeville Prep / Vanguard identity, same skeleton as Goals + the hub):
 * hard corners, hairlines, Inter + JetBrains Mono, ink/silver/paper. What
 * varies PER brand is the accent colour, logo/wordmark, and (optionally) the
 * display font. Registration pages, public catalog/portal views, and email
 * templates resolve the active brand and apply its tokens at render time.
 *
 * Source of truth today is this code seed. When the portal's Supabase is wired
 * (Stage 7 / Module 1) a `brands` table supplies admin-editable overrides that
 * merge OVER these seeds — same pattern the hub uses for its org brand, so a
 * missing row or DB outage still renders the seeded brand. `resolveBrand` keeps
 * its signature across that change.
 */

export interface Brand {
  /** Stable key; also the value program/catalog rows will store as brand_key. */
  key: string;
  name: string;
  /** Accent hex (#rrggbb) → the `--accent` CSS variable. */
  accent: string;
  /** Text colour on top of the accent (buttons). Default white. */
  accentInk: string;
  /** Logo mark + horizontal wordmark, served from /public/brands or storage. */
  logoUrl: string;
  wordmarkUrl: string;
  /** CSS font-family stack for display text; defaults to the shared Vanguard stack. */
  font: string;
  /**
   * True while accent/logo are PLACEHOLDERS awaiting the real per-brand design
   * system (spec: "detailed per-brand design systems will be provided later").
   * Editable without code once the brands table exists.
   */
  provisional: boolean;
}

export const VANGUARD_FONT =
  "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif";

/** Ecosystem gold — the real accent shared by Goals + the hub (#9e8959). */
export const OP_GOLD = '#9e8959';

export const DEFAULT_BRAND_KEY = 'athlete-institute';

const seed = (b: Partial<Brand> & Pick<Brand, 'key' | 'name' | 'accent'>): Brand => ({
  accentInk: '#ffffff',
  logoUrl: `/brands/${b.key}/logo.svg`,
  wordmarkUrl: `/brands/${b.key}/wordmark.svg`,
  font: VANGUARD_FONT,
  provisional: false,
  ...b,
});

/**
 * Seeded brands. AI + Orangeville Prep run the canonical Vanguard gold; ALL CAN
 * and Bears carry PROVISIONAL accents (flagged) until their real design systems
 * arrive — they exist so multi-brand resolution is real and testable now.
 */
export const BRANDS: Brand[] = [
  seed({
    key: 'athlete-institute',
    name: 'Athlete Institute',
    accent: OP_GOLD,
  }),
  seed({
    key: 'orangeville-prep',
    name: 'Orangeville Prep',
    accent: OP_GOLD, // OP IS the Vanguard design system (matches apps + goals)
  }),
  seed({
    key: 'all-can',
    name: 'ALL CAN',
    accent: '#2f5d8a', // PROVISIONAL — awaiting real ALL CAN design system
    provisional: true,
  }),
  seed({
    key: 'bears',
    name: 'Bears',
    accent: '#b4483c', // PROVISIONAL — awaiting real Bears (VB + Rep BB) design system
    provisional: true,
  }),
];

const BY_KEY = new Map(BRANDS.map((b) => [b.key, b]));

export const DEFAULT_BRAND: Brand = BY_KEY.get(DEFAULT_BRAND_KEY)!;

/** Resolve a brand by key, falling back to the default brand for unknown/empty keys. */
export function resolveBrand(key: string | null | undefined): Brand {
  return (key && BY_KEY.get(key)) || DEFAULT_BRAND;
}

/**
 * CSS custom properties for a brand — spread onto a `style` prop on <body> or
 * any scoped wrapper. Components read `var(--accent)` (see globals.css /
 * tailwind), so theming is render-time and cascades to emails too.
 */
export function brandCssVars(brand: Brand): Record<string, string> {
  return {
    '--accent': brand.accent,
    '--accent-ink': brand.accentInk,
    '--font-display': brand.font,
  };
}
