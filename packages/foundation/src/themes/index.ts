/**
 * Theme packs for brand sites (Module 23 §4). PURE and edge-safe: a pack is
 * tokens + metadata; the React layout and block renderers live in
 * components/site/themes/<key> and are picked by the same key.
 *
 * Every theme renders every block type (the renderer set is shared and themed
 * through CSS custom properties), so switching `brand_sites.theme_key` never
 * loses content.
 */

export interface ThemeTokens {
  /** Page ground and ink. */
  ground: string;
  ink: string;
  accent: string;
  accentInk: string;
  /** Dark chrome (header/footer). */
  chrome: string;
  chromeInk: string;
  paper: string;
  silver: string;
  secondary: string;
  rule: string;
  ruleStrong: string;
  ruleDark: string;
  ruleDarkStrong: string;
  /** Font stacks. */
  fontBody: string;
  fontDisplay: string;
  fontNav: string;
  /** Corner radius for controls; brand sites that forbid rounded corners use 0. */
  radius: string;
  pillRadius: string;
}

export interface ThemePack {
  key: string;
  name: string;
  tokens: ThemeTokens;
  /** Google Fonts stylesheet URL (fallback faces); null when the theme is fully system. */
  fontsHref: string | null;
  /** Which fields of `tokens` staff may override from brands.design_tokens. */
  overridable: Array<keyof ThemeTokens>;
}

const SYSTEM_STACK =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif";

export const VANGUARD_THEME: ThemePack = {
  key: 'vanguard',
  name: 'Vanguard (shared)',
  tokens: {
    ground: '#faf9f7',
    ink: '#1e1e1e',
    accent: '#9e8959',
    accentInk: '#ffffff',
    chrome: '#171613',
    chromeInk: '#ffffff',
    paper: '#ffffff',
    silver: '#9ea1a1',
    secondary: '#555555',
    rule: 'rgba(30,30,30,.14)',
    ruleStrong: 'rgba(30,30,30,.6)',
    ruleDark: 'rgba(255,255,255,.2)',
    ruleDarkStrong: 'rgba(255,255,255,.55)',
    fontBody: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif",
    fontDisplay: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif",
    fontNav: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif",
    radius: '9px',
    pillRadius: '999px',
  },
  fontsHref: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
  overridable: ['accent', 'accentInk', 'ground', 'chrome'],
};

/**
 * ALL CAN: white ground, Ink type, red accent, black chrome, hairlines and
 * hard corners (pills only). Display face is Futura Bold from the visitor's
 * device with Jost as the hosted fallback; the header menu uses Futura
 * Medium with Jost 500. See specs/allcan/design-system.
 */
export const ALL_CAN_THEME: ThemePack = {
  key: 'all-can',
  name: 'ALL CAN',
  tokens: {
    ground: '#ffffff',
    ink: '#212322',
    accent: '#CE112D',
    accentInk: '#ffffff',
    chrome: '#000000',
    chromeInk: '#ffffff',
    paper: '#EAEAEA',
    silver: '#9FA1A2',
    secondary: '#53565A',
    rule: 'rgba(33,35,34,.28)',
    ruleStrong: 'rgba(33,35,34,.70)',
    ruleDark: 'rgba(255,255,255,.28)',
    ruleDarkStrong: 'rgba(255,255,255,.60)',
    fontBody: SYSTEM_STACK,
    fontDisplay: `'AC Pillars', 'Jost', ${SYSTEM_STACK}`,
    fontNav: `'AC Nav', 'Jost', ${SYSTEM_STACK}`,
    radius: '0',
    pillRadius: '999px',
  },
  fontsHref: 'https://fonts.googleapis.com/css2?family=Jost:wght@500;700&display=swap',
  overridable: ['accent'],
};

export const THEMES: Record<string, ThemePack> = {
  vanguard: VANGUARD_THEME,
  'all-can': ALL_CAN_THEME,
};

export function resolveTheme(key: string | null | undefined, overrides?: Record<string, unknown> | null): ThemePack {
  const base = (key && THEMES[key]) || VANGUARD_THEME;
  if (!overrides) return base;
  const tokens = { ...base.tokens };
  for (const k of base.overridable) {
    const v = overrides[k];
    if (typeof v === 'string' && v.trim()) (tokens as Record<string, string>)[k] = v.trim();
  }
  return { ...base, tokens };
}

/** CSS custom properties for a theme, spread on the site root element. */
export function themeCssVars(theme: ThemePack): Record<string, string> {
  const t = theme.tokens;
  return {
    '--site-ground': t.ground,
    '--site-ink': t.ink,
    '--site-accent': t.accent,
    '--site-accent-ink': t.accentInk,
    '--site-chrome': t.chrome,
    '--site-chrome-ink': t.chromeInk,
    '--site-paper': t.paper,
    '--site-silver': t.silver,
    '--site-secondary': t.secondary,
    '--site-rule': t.rule,
    '--site-rule-strong': t.ruleStrong,
    '--site-rule-d': t.ruleDark,
    '--site-rule-d-strong': t.ruleDarkStrong,
    '--site-font': t.fontBody,
    '--site-font-display': t.fontDisplay,
    '--site-font-nav': t.fontNav,
    '--site-radius': t.radius,
    '--site-pill': t.pillRadius,
  };
}
