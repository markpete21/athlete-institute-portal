import Link from 'next/link';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { staffReregistrationRates } from '@/lib/staff/staff';

export const dynamic = 'force-dynamic';

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });

function Stars({ avg }: { avg: number }) {
  const filled = Math.round(avg);
  return (
    <span aria-hidden style={{ color: 'var(--accent)', letterSpacing: '1px' }}>
      {'★'.repeat(filled)}<span style={{ opacity: 0.25 }}>{'★'.repeat(5 - filled)}</span>
    </span>
  );
}

/**
 * Staff reviews dashboard: the coach-side read on Module 15 feedback.
 * Ratings are collected + coordinated by the Feedback module; today a
 * program's responses count for every coach who publicly delivered it.
 * Per-coach feedback questions land with the Feedback module review, and
 * this page switches to those answers when they do.
 */
export default async function StaffReviewsPage() {
  const db = supabaseAdmin();

  const [{ data: assigns }, { data: staff }] = await Promise.all([
    db.from('staff_assignments').select('staff_id, program_id, programs(name)').eq('show_public', true),
    db.from('staff').select('id, first_name, last_name, photo_url, status').neq('status', 'archived').order('last_name'),
  ]);
  const rereg = await staffReregistrationRates((staff ?? []).map((s) => s.id));
  const programIds = [...new Set((assigns ?? []).map((a) => a.program_id))];
  const { data: responses } = programIds.length
    ? await db.from('feedback_responses').select('program_id, rating, comment, submitted_at, programs(name)').in('program_id', programIds).not('rating', 'is', null).order('submitted_at', { ascending: false })
    : { data: [] as never[] };

  type Resp = { program_id: number; rating: number; comment: string | null; submitted_at: string | null; programs: unknown };
  const byProgram = new Map<number, Resp[]>();
  for (const r of (responses ?? []) as Resp[]) {
    byProgram.set(r.program_id, [...(byProgram.get(r.program_id) ?? []), r]);
  }

  const rows = (staff ?? [])
    .map((s) => {
      const mine = (assigns ?? []).filter((a) => a.staff_id === s.id);
      const perProgram = mine
        .map((a) => {
          const rs = byProgram.get(a.program_id) ?? [];
          if (!rs.length) return null;
          const avg = Math.round((rs.reduce((sum, r) => sum + r.rating, 0) / rs.length) * 10) / 10;
          return { name: (a.programs as unknown as { name: string } | null)?.name ?? '—', avg, count: rs.length };
        })
        .filter(Boolean) as Array<{ name: string; avg: number; count: number }>;
      const all = mine.flatMap((a) => byProgram.get(a.program_id) ?? []);
      const rr = rereg.get(s.id) ?? null;
      if (!all.length && !rr) return null;
      const avg = all.length ? Math.round((all.reduce((sum, r) => sum + r.rating, 0) / all.length) * 10) / 10 : null;
      return { id: s.id, name: `${s.first_name} ${s.last_name}`, initials: `${s.first_name[0]}${s.last_name[0]}`, photoUrl: s.photo_url, avg, count: all.length, perProgram, rereg: rr };
    })
    .filter(Boolean) as Array<{ id: number; name: string; initials: string; photoUrl: string | null; avg: number | null; count: number; perProgram: Array<{ name: string; avg: number; count: number }>; rereg: { rate: number; eligible: number; returned: number } | null }>;
  rows.sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0) || b.count - a.count);

  const comments = ((responses ?? []) as Resp[]).filter((r) => r.comment?.trim()).slice(0, 12);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-hairline pb-6">
        <div>
          <p className="label text-[11px]">Admin · Staff</p>
          <h1 className="text-5xl">Reviews<span style={{ color: 'var(--accent)' }}>.</span></h1>
          <p className="text-body mt-2 max-w-3xl">
            Collected and coordinated by the <Link href="/feedback" className="underline">Feedback module</Link> — a program&apos;s
            responses count for every coach who publicly delivered it. Per-coach questions are planned with the Feedback review;
            this page switches to those answers when they land.
          </p>
        </div>
        <Link href="/staff" className="btn-ghost btn-sm">← Staff</Link>
      </header>

      <table className="data-table">
        <thead><tr><th /><th>Staff</th><th>Rating</th><th>Re-registration</th><th>By program</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="w-14">
                <span className="block h-10 w-10 overflow-hidden rounded-full border border-hairline bg-paper-panel">
                  {r.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.photoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-silver">{r.initials}</span>
                  )}
                </span>
              </td>
              <td className="text-ink">{r.name}</td>
              <td className="whitespace-nowrap">{r.avg !== null ? <><Stars avg={r.avg} /> <span className="mono text-xs text-silver">{r.avg} ({r.count})</span></> : <span className="text-silver">—</span>}</td>
              <td className="whitespace-nowrap">
                {r.rereg ? (
                  <span title={`${r.rereg.returned} of ${r.rereg.eligible} coached players registered again in a later season`}>
                    <span className="mono font-bold" style={{ color: r.rereg.rate >= 70 ? '#3f7a5b' : r.rereg.rate >= 40 ? '#a08030' : '#b4483c' }}>{r.rereg.rate}%</span>
                    <span className="mono text-xs text-silver"> ({r.rereg.returned}/{r.rereg.eligible})</span>
                  </span>
                ) : (
                  <span className="text-silver" title="Builds once a coached season completes">—</span>
                )}
              </td>
              <td>
                <span className="flex flex-wrap gap-1">
                  {r.perProgram.map((p, i) => <span key={i} className="tag">{p.name} · {p.avg} ({p.count})</span>)}
                </span>
              </td>
              <td><Link href={`/staff/${r.id}`} className="btn-ghost btn-sm">Open</Link></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} className="text-silver">No rated feedback yet — ratings appear here once families submit program feedback.</td></tr>}
        </tbody>
      </table>

      {comments.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-2xl">Recent comments</h2>
          {comments.map((c, i) => (
            <div key={i} className="card flex flex-col gap-1 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Stars avg={c.rating} />
                <span className="tag">{(c.programs as { name: string } | null)?.name ?? '—'}</span>
                {c.submitted_at && <span className="mono text-xs text-silver">{fmt(c.submitted_at)}</span>}
              </div>
              <p className="text-body">{c.comment}</p>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
