import { SignUp } from '@clerk/nextjs';

/**
 * Shared sign-up (Module 1's account-claim flow will layer onto this later).
 * Exempt from the host→tree rewrite so it works on both subdomains.
 */
export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SignUp />
    </main>
  );
}
