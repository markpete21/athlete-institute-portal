import { notFound } from 'next/navigation';
import { FULL_FORM_POINTS, QUICK_REVIEW_POINTS, formByToken } from '@/lib/feedback/feedback';
import { submitFeedbackAction } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Public pre-identified feedback form (Module 15), mobile-first. Star rating is
 * screen one; detail questions are optional below. A star-only submission still
 * counts (quick review, 50 pts); answering the extras upgrades to the full form
 * (250 pts).
 */
export default async function FeedbackPage({ params }: { params: { token: string } }) {
  const form = await formByToken(params.token);
  if (!form) notFound();

  const detailQuestions = form.questions.filter((q) => q.type !== 'stars');

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-5 py-12">
      <header className="flex flex-col gap-1 border-b border-hairline pb-4">
        <p className="label text-[11px]">Feedback · {form.participantName}</p>
        <h1 className="text-3xl">{form.programName}<span style={{ color: 'var(--accent)' }}>.</span></h1>
      </header>

      {form.submitted ? (
        <p className="card p-5 text-center text-ink">Thanks — your feedback is in and your Play Points are credited. 🏀</p>
      ) : (
        <form action={submitFeedbackAction} className="flex flex-col gap-6">
          <input type="hidden" name="token" value={params.token} />

          <fieldset className="flex flex-col gap-2">
            <legend className="text-lg text-ink">Overall, how would you rate this program?</legend>
            <div className="flex justify-between gap-1 py-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="flex grow cursor-pointer flex-col items-center gap-1 border border-hairline py-3 has-[:checked]:border-[var(--accent)] has-[:checked]:text-[var(--accent)]">
                  <input type="radio" name="rating" value={n} required className="sr-only" />
                  <span className="text-2xl">{'★'.repeat(1)}</span>
                  <span className="mono text-xs">{n}</span>
                </label>
              ))}
            </div>
            <textarea name="comment" placeholder="Optional comment" className="input min-h-20 text-sm" />
            <p className="text-xs text-silver">Submitting a rating earns {QUICK_REVIEW_POINTS} Play Points.</p>
          </fieldset>

          {detailQuestions.length > 0 && (
            <details className="card p-4">
              <summary className="cursor-pointer text-ink">Answer {detailQuestions.length} more questions for {FULL_FORM_POINTS} Play Points</summary>
              <div className="mt-3 flex flex-col gap-3">
                {detailQuestions.map((q) => (
                  <div key={q.key}>
                    <label className="field-label">{q.label}</label>
                    {q.type === 'text' ? (
                      <textarea name={`q_${q.key}`} className="input min-h-16 w-full text-sm" />
                    ) : q.type === 'yesno' ? (
                      <select name={`q_${q.key}`} className="input w-full text-sm"><option value="">—</option><option>Yes</option><option>No</option></select>
                    ) : q.type === 'nps' ? (
                      <input name={`q_${q.key}`} type="number" min="0" max="10" className="input w-24 text-sm" />
                    ) : (
                      <select name={`q_${q.key}`} className="input w-full text-sm"><option value="">—</option>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}

          <button className="btn-gold w-full">Submit feedback</button>
        </form>
      )}
    </main>
  );
}
