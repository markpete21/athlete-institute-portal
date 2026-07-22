import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Athlete Institute Portal',
  description: 'Facility management and registration for Athlete Institute.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Set by middleware from the request host: 'play' | 'admin'.
  const app = headers().get('x-portal-app') ?? 'play';

  return (
    <html lang="en" data-portal-app={app}>
      <body>{children}</body>
    </html>
  );
}
