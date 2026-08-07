import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createStandaloneEvent, duplicateStandaloneEvent } from '@/lib/competitive/competitive';
import { listPublicPrograms } from '@/lib/programs/catalog';
import { programLanding } from '@/lib/compete/compete';

/**
 * DEV-ONLY: standalone Compete events (migration 0057). Create -> excluded
 * from the Play catalog, tournament kind sets tournament_mode, duplicate
 * copies brand/sponsors/divisions/teams but not games, copied divisions land
 * unpublished. Cleans up everything it makes.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const rec = (s: string, ok: boolean, d: string) => steps.push({ step: s, ok, detail: d });
  const madePrograms: number[] = [];

  try {
    const id = await createStandaloneEvent(
      { name: 'Verify Standalone Classic', kind: 'tournament', seasonKey: null, brandKey: 'athlete-institute' },
      'dev:verify',
    );
    madePrograms.push(id);
    const { data: prog } = await db.from('programs').select('compete_only, tournament_mode, status').eq('id', id).single();
    rec('created as compete_only', prog?.compete_only === true, JSON.stringify(prog));
    rec('tournament kind sets tournament_mode', prog?.tournament_mode === 'championship', prog?.tournament_mode ?? 'null');

    // publish it briefly to prove the Play catalog STILL excludes it
    await db.from('programs').update({ status: 'registration_open' }).eq('id', id);
    const catalog = await listPublicPrograms();
    rec('Play catalog excludes standalone events', !catalog.some((c) => c.id === id), `${catalog.length} public programs`);

    // give it a division + team + sponsor + brand, then duplicate
    const { data: divRow } = await db.from('divisions').insert({ program_id: id, name: 'Open', sport: 'basketball', show_on_compete: true }).select('id').single();
    await db.from('teams').insert([{ division_id: divRow!.id, name: 'Verify Team A', sort_order: 1 }, { division_id: divRow!.id, name: 'Verify Team B', sort_order: 2 }]);
    await db.from('compete_sponsors').insert({ program_id: id, name: 'Verify Sponsor', sort: 1 });
    await db.from('programs').update({ compete_brand: { primary: '#141110', accent: '#2f5d8a' }, tickets_url: 'https://tickets.athleteinstitute.ca/e/x' }).eq('id', id);

    const landing = await programLanding(id);
    rec('standalone gets a landing page', !!landing && landing.kind === 'tournament', landing?.name ?? 'null');

    const copyId = await duplicateStandaloneEvent(id, 'dev:verify');
    madePrograms.push(copyId);
    const { data: copy } = await db.from('programs').select('name, compete_only, tournament_mode, compete_brand, tickets_url').eq('id', copyId).single();
    rec('duplicate copies brand + tickets + mode', copy?.compete_only === true && copy?.tournament_mode === 'championship' && (copy?.compete_brand as Record<string, unknown>)?.accent === '#2f5d8a' && copy?.tickets_url === 'https://tickets.athleteinstitute.ca/e/x', copy?.name ?? '');
    const { data: copyDivs } = await db.from('divisions').select('id, show_on_compete, stats_enabled').eq('program_id', copyId);
    rec('divisions copied, unpublished, stats off', (copyDivs?.length ?? 0) === 1 && copyDivs!.every((d) => !d.show_on_compete && !d.stats_enabled), `${copyDivs?.length} divisions`);
    const { data: copyTeams } = await db.from('teams').select('id').in('division_id', (copyDivs ?? []).map((d) => d.id));
    rec('team shells copied', (copyTeams?.length ?? 0) === 2, `${copyTeams?.length} teams`);
    const { data: copyGames } = await db.from('games').select('id').in('division_id', (copyDivs ?? []).map((d) => d.id));
    rec('games NOT copied', (copyGames?.length ?? 0) === 0, `${copyGames?.length} games`);
    const { data: copySponsors } = await db.from('compete_sponsors').select('name').eq('program_id', copyId);
    rec('sponsors copied', copySponsors?.length === 1 && copySponsors[0].name === 'Verify Sponsor', `${copySponsors?.length}`);

    // non-standalone programs refuse to duplicate here
    const { data: normal } = await db.from('programs').select('id').eq('compete_only', false).limit(1).maybeSingle();
    if (normal) {
      let refused = false;
      try { await duplicateStandaloneEvent(normal.id, 'dev:verify'); } catch { refused = true; }
      rec('play-linked programs refuse duplicate', refused, `program ${normal.id}`);
    }

    const allOk = steps.every((s) => s.ok);
    return NextResponse.json({ allOk, steps });
  } catch (e) {
    return NextResponse.json({ allOk: false, steps, error: String(e) }, { status: 500 });
  } finally {
    // cascade deletes divisions/teams/sponsors via FKs
    if (madePrograms.length) await db.from('programs').delete().in('id', madePrograms);
  }
}
