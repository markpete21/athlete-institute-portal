import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { ClerkProvider } from '@clerk/nextjs';
import { brandCssVars, DEFAULT_BRAND } from '@ai/foundation';
import './globals.css';
import './print.css';

/**
 * One Next app serves three hosts (play./admin./compete.), so the favicon is
 * resolved per request from the middleware's x-portal-app header — a static
 * `metadata` export would pin every tab to the same icon. The icons are still
 * SVG distillations of each app's animated mark (public/favicons/).
 */
export async function generateMetadata(): Promise<Metadata> {
  const app = headers().get('x-portal-app') ?? 'play';
  const icon = ['play', 'admin', 'compete'].includes(app) ? app : 'play';
  return {
    title: 'Athlete Institute Portal',
    description: 'Facility management and registration for Athlete Institute.',
    icons: { icon: [{ url: `/favicons/${icon}.svg`, type: 'image/svg+xml' }] },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Set by middleware from the request host: 'play' | 'admin'.
  const app = headers().get('x-portal-app') ?? 'play';

  // The default brand sets --accent app-wide; brand-scoped subtrees (a program
  // under Orangeville Prep / ALL CAN / Bears) override --accent on a wrapper.
  const brandVars = brandCssVars(DEFAULT_BRAND) as React.CSSProperties;

  return (
    <ClerkProvider>
      <html lang="en" data-portal-app={app}>
        <body style={brandVars}>{children}</body>
      </html>
    </ClerkProvider>
  );
}
