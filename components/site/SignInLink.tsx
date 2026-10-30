'use client';

import { useClerk } from '@clerk/nextjs';
import { useEffect, useState } from 'react';

/**
 * Sign in link on a brand host (a Clerk satellite). Clerk's docs: links to the
 * primary's sign-in page must be built with `buildSignInUrl()` so the
 * `__clerk_synced` marker is on the redirect; a hand-written
 * `play.../sign-in?redirect_url=` brings the visitor back without a session.
 * Server-rendered with the plain URL as a fallback, swapped once Clerk loads.
 */
export default function SignInLink({ fallbackHref, redirectPath, className, children }: { fallbackHref: string; redirectPath?: string; className?: string; children: React.ReactNode }) {
  const clerk = useClerk();
  const [href, setHref] = useState(fallbackHref);
  useEffect(() => {
    if (!clerk.loaded) return;
    try {
      const redirectUrl = redirectPath ? new URL(redirectPath, window.location.origin).toString() : window.location.href;
      setHref(clerk.buildSignInUrl({ redirectUrl }));
    } catch { /* keep the fallback */ }
  }, [clerk, clerk.loaded, redirectPath]);
  return <a className={className} href={href}>{children}</a>;
}
