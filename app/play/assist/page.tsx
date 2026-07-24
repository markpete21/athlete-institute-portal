import { getPortalSession } from '@/lib/auth';
import AssistChat from './chat';

export const dynamic = 'force-dynamic';

/**
 * Assist (Module 21): public program assistant; signed-in households get the
 * concierge scope automatically (server resolves the surface either way).
 */
export default async function AssistPage() {
  const session = await getPortalSession();
  const surface = session.userId && session.familyId ? 'customer' : 'public';

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-1 border-b border-hairline pb-4">
        <p className="label text-[11px]">Assist</p>
        <h1 className="text-4xl">Ask us anything<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-body text-sm">{surface === 'customer' ? 'I can also check your own schedule, balance, and registrations.' : 'Programs, prices, ages, dates — I answer from live data only.'}</p>
      </header>
      <AssistChat surface={surface} />
      <p className="text-xs text-silver">Assist answers from live program data and will hand you to a real person when it can&apos;t help: text/call 519-941-0492 or info@athleteinstitute.ca.</p>
    </main>
  );
}
