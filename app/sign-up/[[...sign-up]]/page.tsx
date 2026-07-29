import { headers } from 'next/headers';
import { SignUp } from '@clerk/nextjs';
import PlayWordmark from '@/components/brand/PlayWordmark';

export const dynamic = 'force-dynamic';

/**
 * Shared sign-up (Module 1's account-claim flow layers onto this). Exempt from
 * the host→tree rewrite so it works on both subdomains. The lockup brands
 * Clerk's "Complete your profile" step too, since that renders inside <SignUp>.
 */
export default function SignUpPage() {
  const app = headers().get('x-portal-app') ?? 'play';
  return (
    <main className="pw-auth">
      <PlayWordmark variant={app === 'admin' ? 'admin' : 'portal'} size={34} />
      <SignUp />
    </main>
  );
}
