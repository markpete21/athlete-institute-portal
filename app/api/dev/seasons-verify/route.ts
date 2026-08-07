import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createSeason, listSeasons, setSeasonArchived, updateSeason } from '@/lib/seasons/seasons';

/**
 * DEV-ONLY: seasons manager (migration 0055). Seed rows present, program-key
 * backfill left nothing orphaned, CRUD round-trip, archive semantics, derived
 * status. Creates one temp season and removes it.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const rec = (s: string, ok: boolean, d: string) => steps.push({ step: s, ok, detail: d });
  let tempId: number | null = null;

  try {
    const all = await listSeasons({ includeArchived: true });
    rec('canonical 2026 seasons seeded', ['2026:jan-apr', '2026:may-aug', '2026:sep-dec'].every((k) => all.some((s) => s.key === k)), `${all.length} seasons`);

    // every program season_key resolves to a season row (backfill worked)
    const { data: progKeys } = await db.from('programs').select('season_key').not('season_key', 'is', null).neq('season_key', '');
    const keys = new Set(all.map((s) => s.key));
    const orphans = [...new Set((progKeys ?? []).map((p) => p.season_key as string))].filter((k) => !keys.has(k));
    rec('no orphaned program season keys', orphans.length === 0, orphans.join(',') || 'all resolve');

    tempId = await createSeason({ key: 'dev:seasons-verify', name: 'Verify Season', startsOn: '2030-01-01', endsOn: '2030-04-30' }, 'dev:verify');
    let mine = (await listSeasons({ includeArchived: true })).find((s) => s.id === tempId);
    rec('create + future dates -> upcoming', mine?.status === 'upcoming', mine?.status ?? 'missing');

    await updateSeason(tempId, { name: 'Verify Season 2', startsOn: '2020-01-01', endsOn: '2020-04-30' }, 'dev:verify');
    mine = (await listSeasons({ includeArchived: true })).find((s) => s.id === tempId);
    rec('update renames + past dates -> ended', mine?.name === 'Verify Season 2' && mine?.status === 'ended', `${mine?.name} / ${mine?.status}`);

    await setSeasonArchived(tempId, true, 'dev:verify');
    const active = await listSeasons();
    const withArchived = await listSeasons({ includeArchived: true });
    rec('archived hidden from default list', !active.some((s) => s.id === tempId) && withArchived.some((s) => s.id === tempId), 'hidden but present');
    rec('archived status wins over dates', withArchived.find((s) => s.id === tempId)?.status === 'archived', withArchived.find((s) => s.id === tempId)?.status ?? '');

    const allOk = steps.every((s) => s.ok);
    return NextResponse.json({ allOk, steps });
  } catch (e) {
    return NextResponse.json({ allOk: false, steps, error: String(e) }, { status: 500 });
  } finally {
    if (tempId != null) await db.from('seasons').delete().eq('id', tempId);
  }
}
