import { confirmationByToken } from '@/lib/competitive/coachConfirmations';
import { respondAction } from './actions';

export const dynamic = 'force-dynamic';

/**
 * PUBLIC coach confirmation page - the emailed link. The token is the
 * credential; no login required (a volunteer coach may have no account).
 * Confirm collects answers to the division's custom questions; decline asks
 * for a short note so the admin can find a replacement early.
 */
export default async function CoachConfirmPage({ params }: { params: { token: string } }) {
  const view = await confirmationByToken(params.token);

  if (!view) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center gap-3 px-6 py-14">
        <div className="card flex flex-col gap-2 p-6">
          <p className="label text-[11px]">Coach confirmation</p>
          <h1 className="text-2xl">This link is no longer valid<span style={{ color: 'var(--accent)' }}>.</span></h1>
          <p className="text-body text-sm">A newer confirmation email may have replaced it, or the team&apos;s coach has changed. Check your inbox for the latest link, or contact the program office.</p>
        </div>
      </main>
    );
  }

  const answered = view.status !== 'pending';

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center gap-4 px-6 py-14">
      <header className="flex flex-col gap-1">
        <p className="label text-[11px]">{view.programName} &middot; {view.divisionName}</p>
        <h1 className="text-3xl">Hi {view.coachFirstName} — you&apos;re coaching {view.teamName}<span style={{ color: 'var(--accent)' }}>.</span></h1>
      </header>

      {answered ? (
        <div className="card flex flex-col gap-3 p-6">
          <p className="text-ink text-sm">
            {view.status === 'confirmed'
              ? 'You are confirmed. See you on the court - the program office has your answers.'
              : 'You declined this season. Thanks for letting us know early - the program office is finding a replacement.'}
          </p>
          {view.status === 'confirmed' && view.answers && Object.keys(view.answers).length > 0 && (
            <ul className="flex flex-col gap-1 border-t border-hairline pt-3">
              {Object.entries(view.answers).map(([q, a]) => (
                <li key={q} className="text-sm"><span className="text-silver">{q}</span> <span className="text-ink">{a}</span></li>
              ))}
            </ul>
          )}
          <p className="label text-[10px]">Need to change your response? Contact the program office and they can re-send the form.</p>
        </div>
      ) : (
        <form action={respondAction} className="card flex flex-col gap-4 p-6">
          <input type="hidden" name="token" value={params.token} />
          <p className="text-body text-sm">One tap and you&apos;re set. If you can&apos;t coach this season, decline below so we can line up a replacement early.</p>
          {view.questions.map((q, i) => (
            <div key={i}>
              <label className="field-label" htmlFor={`q_${i}`}>{q}</label>
              <input id={`q_${i}`} name={`q_${i}`} className="input" />
            </div>
          ))}
          <div>
            <label className="field-label" htmlFor="note">Anything we should know? (optional — required only if declining)</label>
            <textarea id="note" name="note" rows={2} className="input" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" name="decision" value="confirmed" className="btn-gold">Confirm — I&apos;m coaching</button>
            <button type="submit" name="decision" value="declined" className="btn-ghost">I can&apos;t this season</button>
          </div>
        </form>
      )}
    </main>
  );
}
