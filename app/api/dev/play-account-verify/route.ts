import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { accountView } from '@/lib/play/account';
import { brandTiles } from '@/lib/play/brands';

/** DEV-ONLY: exercise the Play Portal data layer against a real household. */
export async function GET() {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (s: string, ok: boolean, d: string) => steps.push({ step: s, ok, detail: d });
  try {
    const db = supabaseAdmin();
    const tiles = await brandTiles();
    record('brand tiles from DB (4 header brands)', tiles.length === 4, tiles.map((t) => `${t.name}${t.logoUrl ? '+logo' : ''}(${t.programs.length}p)`).join(', '));

    const { data: fam } = await db.from('families').select('id, name').limit(1).maybeSingle();
    if (!fam) { record('needs at least one family', false, 'none found'); throw new Error('no family'); }
    const v = await accountView(fam.id, 14);
    record('accountView resolves for a real household', v.familyId === fam.id, `family "${v.familyName}"`);
    record('members carry distinct stable colours', new Set(v.members.map((m) => m.colour)).size === v.members.length, v.members.map((m) => `${m.firstName}:${m.colour}`).join(' '));
    record('spine returns day groups', Array.isArray(v.days), `${v.days.length} days, ${v.days.reduce((a, d) => a + d.sessions.length, 0)} sessions`);
    record('balance shape', typeof v.balance.owedCents === 'number', JSON.stringify(v.balance));
    record('attention list builds', Array.isArray(v.attention), `${v.attention.length} items: ${v.attention.map((a) => a.kind).join(',')}`);
    record('null household is safe (no throw)', (await accountView(null)).members.length === 0, 'empty view');
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  }
  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
