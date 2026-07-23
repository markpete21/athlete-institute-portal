import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getPortalSession } from '@/lib/auth';
import { tenantAllowedPath } from '@ai/foundation';

/**
 * play.* gate (Module 1 §User Types): tenants get ONLY the read-only facility
 * schedule — no booking, no registration. Everyone else passes through.
 * The schedule itself is Module 2; /schedule is its placeholder home.
 */
export default async function PlayLayout({ children }: { children: React.ReactNode }) {
  const session = await getPortalSession();

  if (session.userType === 'tenant') {
    const path = headers().get('x-portal-path') ?? '/';
    if (!tenantAllowedPath(path)) redirect('/schedule');
  }

  return <>{children}</>;
}
