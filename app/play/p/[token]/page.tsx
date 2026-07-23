import Link from 'next/link';
import { notFound } from 'next/navigation';
import { brandCssVars, formatCAD, resolveBrand } from '@ai/foundation';
import { getPortalSession } from '@/lib/auth';
import { getProgramByToken, logFlowEvent } from '@/lib/programs/catalog';

export const dynamic = 'force-dynamic';

/**
 * Public program detail = the share-link target (Module 4 Stage 8),
 * brand-themed per the program's brand. Logs a 'browsing' flow event for
 * retargeting. The register button carries into the cart flow (Stage 3).
 */
export default async function ProgramDetailPage({ params }: { params: { token: string } }) {
  const program = await getProgramByToken(params.token);
  if (!program) notFound();

  const session = await getPortalSession();
  await logFlowEvent('browsing', { programId: program.id, profileId: session.profileId, familyId: session.familyId, email: session.email });

  const brandVars = brandCssVars(resolveBrand(program.brand_key)) as React.CSSProperties;
  const full = program.status === 'full' || program.spots_left === 0;

  return (
    <main style={brandVars} className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-16">
      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <p className="label text-[11px]">{program.type_name} · {program.category}</p>
        <h1 className="text-5xl">{program.name}<span style={{ color: 'var(--accent)' }}>.</span></h1>
        {program.sport_tag && <span className="tag">{program.sport_tag}</span>}
      </header>

      {program.description && <p className="text-body">{program.description}</p>}

      <div className="card flex items-center justify-between gap-4 p-5">
        <div>
          <p className="mono text-2xl text-ink">{formatCAD(program.base_price_cents)}</p>
          <p className="text-sm text-silver">
            {full ? 'Program full — join the waitlist' : program.spots_left == null ? 'Registration open' : `${program.spots_left} spots left`}
            {(program.min_age || program.max_age) && ` · ages ${program.min_age ?? ''}–${program.max_age ?? ''}`}
          </p>
        </div>
        {session.userId ? (
          <Link href={`/account`} className="btn-gold">{full ? 'Join waitlist' : 'Register'}</Link>
        ) : (
          <Link href="/sign-in" className="btn-gold">Sign in to register</Link>
        )}
      </div>

      <Link href="/programs" className="label text-[11px] hover:text-ink">← All programs</Link>
    </main>
  );
}
