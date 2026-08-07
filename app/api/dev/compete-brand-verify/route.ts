import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { normalizeBrand, programLanding } from '@/lib/compete/compete';

/**
 * DEV-ONLY: league landing pages (migration 0056). Brand jsonb round-trip,
 * sponsor ordering, tickets passthrough, unpublished-program gate, brand
 * normalization guards. Uses a real published program; restores everything.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const rec = (s: string, ok: boolean, d: string) => steps.push({ step: s, ok, detail: d });
  let programId: number | null = null;
  let saved: { compete_brand: unknown; tickets_url: string | null } | null = null;
  const sponsorIds: number[] = [];

  try {
    const { data: div } = await db.from('divisions').select('program_id').eq('show_on_compete', true).not('program_id', 'is', null).limit(1).maybeSingle();
    const pid: number | null = div?.program_id ?? null;
    if (pid == null) return NextResponse.json({ allOk: false, steps: [{ step: 'find published program', ok: false, detail: 'none' }] });
    programId = pid;
    const { data: progRow } = await db.from('programs').select('compete_brand, tickets_url').eq('id', pid).single();
    saved = progRow as { compete_brand: unknown; tickets_url: string | null };

    await db.from('programs').update({
      compete_brand: { primary: '#141110', accent: '#b4483c', logoUrl: null, heroUrl: null, heroType: null },
      tickets_url: 'https://tickets.athleteinstitute.ca/e/verify',
    }).eq('id', pid);
    const { data: s1 } = await db.from('compete_sponsors').insert({ program_id: pid, name: 'Verify Sponsor B', sort: 2 }).select('id').single();
    const { data: s2 } = await db.from('compete_sponsors').insert({ program_id: pid, name: 'Verify Sponsor A', sort: 1 }).select('id').single();
    sponsorIds.push(s1!.id, s2!.id);

    const landing = await programLanding(pid);
    rec('landing exists for published program', !!landing, landing?.name ?? 'null');
    rec('brand colours round-trip', landing?.brand.primary === '#141110' && landing?.brand.accent === '#b4483c', JSON.stringify(landing?.brand ?? {}));
    rec('tickets url passes through', landing?.ticketsUrl === 'https://tickets.athleteinstitute.ca/e/verify', landing?.ticketsUrl ?? 'null');
    rec('sponsors in sort order', landing?.sponsors.map((s) => s.name).join('|') === 'Verify Sponsor A|Verify Sponsor B', landing?.sponsors.map((s) => s.name).join('|') ?? '');
    rec('divisions listed with team counts', (landing?.divisions.length ?? 0) > 0 && landing!.divisions.every((d) => typeof d.teamCount === 'number'), `${landing?.divisions.length} divisions`);
    rec('kind derives from tournament_mode', landing?.kind === 'league' || landing?.kind === 'tournament', landing?.kind ?? '');

    // unpublished program -> null (use an id with no published divisions)
    const { data: allProgs } = await db.from('programs').select('id').order('id', { ascending: false }).limit(50);
    const { data: pubDivs } = await db.from('divisions').select('program_id').eq('show_on_compete', true);
    const pubSet = new Set((pubDivs ?? []).map((d) => d.program_id));
    const dark = (allProgs ?? []).find((p) => !pubSet.has(p.id));
    if (dark) rec('program without published divisions -> null', (await programLanding(dark.id)) === null, `program ${dark.id}`);

    const norm = normalizeBrand({ primary: 'javascript:alert(1)', accent: '#ABCDEF', logoUrl: '', heroType: 'video' });
    rec('normalizeBrand rejects junk + keeps valid', norm.primary === '#1e1e1e' && norm.accent === '#ABCDEF', JSON.stringify(norm));
    rec('empty logoUrl -> null (monogram)', norm.logoUrl === null, String(norm.logoUrl));

    const allOk = steps.every((x) => x.ok);
    return NextResponse.json({ allOk, steps });
  } catch (e) {
    return NextResponse.json({ allOk: false, steps, error: String(e) }, { status: 500 });
  } finally {
    if (sponsorIds.length) await db.from('compete_sponsors').delete().in('id', sponsorIds);
    if (programId != null && saved) await db.from('programs').update({ compete_brand: saved.compete_brand ?? {}, tickets_url: saved.tickets_url }).eq('id', programId);
  }
}
