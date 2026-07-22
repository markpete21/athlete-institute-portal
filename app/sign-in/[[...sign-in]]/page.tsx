import { SignIn } from '@clerk/nextjs';

/**
 * Shared sign-in, served identically on play.* and admin.* (middleware exempts
 * it from the host→tree rewrite). Uses the shared Clerk instance, so a session
 * here is recognized across every Athlete Institute app (SSO).
 */
export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SignIn />
    </main>
  );
}
