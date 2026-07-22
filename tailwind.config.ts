import type { Config } from 'tailwindcss';

/**
 * Stage-1 tokens: the Athlete Institute default brand (black / white / gold,
 * Helvetica Neue). Stage 5 (brand theming) converts these to CSS variables
 * resolved per-brand at render time; Stage 8 builds the UI kit on top.
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
        ink: '#111111',
        gold: '#A18F60',
        silver: '#9EA1A1',
      },
      fontFamily: {
        sans: ['Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
