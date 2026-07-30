import { headers } from 'next/headers';
import { SignIn } from '@clerk/nextjs';
import PlayWordmark from '@/components/brand/PlayWordmark';

export const dynamic = 'force-dynamic';

/**
 * Shared sign-in, served identically on play.* and admin.* (middleware exempts
 * it from the host→tree rewrite). Uses the shared Clerk instance, so a session
 * here is recognized across every Athlete Institute app (SSO).
 *
 * The lockup above the widget also brands Clerk's own follow-on screens
 * ("Complete your profile", verification, MFA), which we don't render ourselves.
 */
export default function SignInPage() {
  const app = headers().get('x-portal-app') ?? 'play';
  return (
    <main className="pw-auth">
      <PlayWordmark
        variant={app === 'admin' ? 'admin' : app === 'compete' ? 'compete' : 'portal'}
        size={34}
      />
      <SignIn />
    </main>
  );
}
