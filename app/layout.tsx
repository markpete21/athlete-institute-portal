import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { ClerkProvider } from '@clerk/nextjs';
import { brandCssVars, DEFAULT_BRAND } from '@ai/foundation';
import './globals.css';

export const metadata: Metadata = {
  title: 'Athlete Institute Portal',
  description: 'Facility management and registration for Athlete Institute.',
};

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
