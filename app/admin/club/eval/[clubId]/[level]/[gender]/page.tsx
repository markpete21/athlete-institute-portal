import { supabaseAdmin } from '@ai/foundation/supabase';
import { evaluationSheet, type Gender } from '@/lib/club/club';

export const dynamic = 'force-dynamic';

/**
 * Printable evaluation sheet (Module 11 Stage 3): numbered players, a 1-5 rating
 * box and a notes line each. Print-and-fill (Cmd/Ctrl-P -> Save as PDF).
 */
export default async function EvalSheetPage({ params }: { params: { clubId: string; level: string; gender: string } }) {
  const clubId = Number(params.clubId);
  const level = decodeURIComponent(params.level);
  const gender = params.gender as Gender;
  const { data: club } = await supabaseAdmin().from('clubs').select('name').eq('id', clubId).maybeSingle();
  const rows = await evaluationSheet(clubId, level, gender);

  return (
    <main className="mx-auto max-w-3xl px-8 py-10 print:py-0">
      <div className="mb-6 flex items-end justify-between border-b-2 border-ink pb-2">
        <div>
          <p className="label text-[11px]">{club?.name}</p>
          <h1 className="text-2xl">{level} {gender} — Tryout Evaluation</h1>
        </div>
        <p className="text-sm text-silver">Date: ______________ Evaluator: ______________</p>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink text-left">
            <th className="w-10 py-2">#</th>
            <th className="py-2">Player</th>
            <th className="w-40 py-2">Rating (1–5)</th>
            <th className="py-2">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.playerId} className="border-b border-hairline">
              <td className="py-3 font-mono">{r.number}</td>
              <td className="py-3">{r.name}</td>
              <td className="py-3 tracking-widest">1 &nbsp; 2 &nbsp; 3 &nbsp; 4 &nbsp; 5</td>
              <td className="py-3">&nbsp;</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-silver">No players on this tryout roster yet.</td></tr>}
        </tbody>
      </table>

      <p className="mt-6 text-xs text-silver print:hidden">Print or Save as PDF: Cmd/Ctrl-P. Flags (Selected / Considering / Out) are set back in the club roster.</p>
    </main>
  );
}
