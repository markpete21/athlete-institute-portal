import { NextResponse } from 'next/server';
import { ancestorIds, buildTree, descendantIds, flattenTree, wouldCycle } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createFacility, listFacilities, moveFacility, reorderFacility, restoreFacility, softDeleteFacility } from '@/lib/facilities';

/**
 * DEV-ONLY: verifies the Stage-1 tree — seed shape, walkers (descendants/
 * ancestors), cycle prevention, sibling-name uniqueness, soft-delete cascade +
 * restore, reorder. Synthetic nodes cleaned up (hard-delete is fine for them:
 * they never carry bookings).
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const madeIds: number[] = [];

  try {
    // 1. seed shape: the real AI tree
    const rows = await listFacilities();
    const byName = new Map(rows.map((r) => [r.name, r]));
    const dome = byName.get('Dome');
    const court1 = byName.get('Dome Court 1');
    const ai = byName.get('Athlete Institute');
    const domeKids = rows.filter((r) => r.parent_id === dome?.id);
    record(
      'seed: real tree present',
      !!dome && !!court1 && !!ai && domeKids.length === 3 && byName.get('Bear Cub Coffee')?.bookable === false &&
        byName.get('Orangeville, ON')?.bookable === false,
      `${rows.length} live nodes, Dome has ${domeKids.length} courts`,
    );

    // 2. walkers: Dome descendants = 3 courts + 6 baskets; basket ancestors chain to root
    const domeDesc = descendantIds(rows, dome!.id);
    const basket = byName.get('Court 1 - East Basket');
    const basketAnc = ancestorIds(rows, basket!.id);
    record(
      'walkers: descendants + ancestors',
      domeDesc.length === 9 &&
        basketAnc[0] === court1!.id && basketAnc.includes(dome!.id) && basketAnc.includes(ai!.id) && basketAnc.length === 4,
      `Dome descendants=${domeDesc.length}, basket ancestor chain=${basketAnc.length}`,
    );

    // 3. buildTree ordering + depth
    const ordered = flattenTree(buildTree(rows));
    const rootIdx = ordered.findIndex((n) => n.name === 'Orangeville, ON');
    const domeNode = ordered.find((n) => n.name === 'Dome');
    record('buildTree: order + depth', rootIdx === 0 && domeNode?.depth === 2, `root first, Dome depth=${domeNode?.depth}`);

    // 4. cycle prevention: moving Dome under one of its baskets must fail
    let cycleBlocked = false;
    try { await moveFacility(dome!.id, basket!.id, 'system:verify'); } catch { cycleBlocked = true; }
    record('cycle prevention (Dome under its basket)', cycleBlocked && wouldCycle(rows, dome!.id, basket!.id), `blocked=${cycleBlocked}`);

    // 5. sibling-name uniqueness (case-insensitive) enforced by the DB
    let dupBlocked = false;
    try {
      const n = await createFacility({ name: 'dome', parentId: ai!.id }, 'system:verify');
      madeIds.push(n.id);
    } catch { dupBlocked = true; }
    record('sibling name uniqueness (case-insensitive)', dupBlocked, `duplicate "dome" under AI rejected=${dupBlocked}`);

    // 6. create + reorder: two synthetic siblings swap
    const t1 = await createFacility({ name: `ZVerify A ${Date.now()}`, parentId: ai!.id }, 'system:verify');
    const t2 = await createFacility({ name: `ZVerify B ${Date.now()}`, parentId: ai!.id }, 'system:verify');
    madeIds.push(t1.id, t2.id);
    await reorderFacility(t2.id, 'up', 'system:verify');
    const after = await listFacilities();
    const a1 = after.find((r) => r.id === t1.id)!;
    const a2 = after.find((r) => r.id === t2.id)!;
    record('reorder swaps siblings', a2.sort_order < a1.sort_order, `B(${a2.sort_order}) now before A(${a1.sort_order})`);

    // 7. soft-delete cascades to descendants; restore brings back the node
    const child = await createFacility({ name: 'ZVerify child', parentId: t1.id }, 'system:verify');
    madeIds.push(child.id);
    await softDeleteFacility(t1.id, 'system:verify');
    const live = await listFacilities();
    const goneBoth = !live.some((r) => r.id === t1.id) && !live.some((r) => r.id === child.id);
    await restoreFacility(t1.id, 'system:verify');
    const restored = (await listFacilities()).some((r) => r.id === t1.id);
    record('soft-delete cascades; restore works', goneBoth && restored, `cascade=${goneBoth}, restored=${restored}`);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    // Synthetic nodes: children first (FK restrict), then parents.
    for (const id of [...madeIds].reverse()) {
      await db.from('facilities').delete().eq('id', id);
    }
    record('cleanup', true, `${madeIds.length} synthetic nodes removed`);
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
