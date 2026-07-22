import type { Config } from 'tailwindcss';

/**
 * Athlete Institute Portal — Orangeville Prep / Vanguard brand identity, shared
 * verbatim with the Goals dashboard and Apps hub so every AI app reads as one
 * system.
 *
 * Ink #1E1E1E (never pure black) · Trophy Gold #9E8959 (the single accent) ·
 * Silver #9EA1A1 (all labels/kickers/captions) · white "paper" surfaces ·
 * structure from hairlines, not shadows · hard corners everywhere except pills.
 *
 * Per-sub-brand accents (AI / Orangeville Prep / ALL CAN / Bears) override the
 * gold at render time via the `--accent` CSS variable (see @ai/foundation
 * brands) — utilities that must follow the active brand use `var(--accent)`,
 * not the static `gold`.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './packages/foundation/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: '#9E8959',
          50: '#F5F2EA',
          100: '#EBE5D6',
          600: '#8A784E',
          700: '#6F613F',
        },
        ink: {
          DEFAULT: '#1E1E1E',
          surface: '#242424',
          soft: '#2E2E2E',
          border: 'rgba(255,255,255,0.16)',
        },
        paper: {
          DEFAULT: '#FFFFFF',
          soft: '#FAFAF8',
          panel: '#F5F2EA',
        },
        silver: '#9EA1A1',
        body: '#333333',
        hairline: 'rgba(30,30,30,0.14)',
        // Quiet signal colors (muted to respect the single-accent rule).
        pos: '#3F7A5B',
        neg: '#B4483C',
      },
      fontFamily: {
        sans: ['var(--font-display)', 'Inter', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'ui-monospace', 'SF Mono', 'monospace'],
      },
      borderRadius: {
        none: '0',
        DEFAULT: '0',
        sm: '0',
        md: '0',
        lg: '0',
        full: '9999px',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
