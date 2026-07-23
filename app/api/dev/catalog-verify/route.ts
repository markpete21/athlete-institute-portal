import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, listProgramTypes, setProgramStatus } from '@/lib/programs/programs';
import { getProgramByToken, listPublicPrograms, logFlowEvent, retargetingList } from '@/lib/programs/catalog';

/**
 * DEV-ONLY: Stage-8 catalog + abandoned-cart - only public statuses listed,
 * filters (category/type/sport/age), share-token lookup, flow-event logging +
 * retargeting (in_cart drop surfaces, completed does not). Cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const programIds: number[] = [];
  const tag = `cat_${Date.now()}`;

  try {
    const types = await listProgramTypes();
    const camp = types.find((t) => t.key === 'camp')!;
    const league = types.find((t) => t.key === 'league')!;

    // draft (hidden), published camp (shown), registration_open league (shown)
    const draft = await createProgram({ name: `${tag} Draft`, programTypeId: camp.id, actorClerkId: 'system:verify' });
    const pubCamp = await createProgram({ name: `${tag} Summer Camp`, programTypeId: camp.id, sportTag: 'Basketball', minAge: 8, maxAge: 12, actorClerkId: 'system:verify' });
    const openLeague = await createProgram({ name: `${tag} Fall League`, programTypeId: league.id, sportTag: 'Volleyball', actorClerkId: 'system:verify' });
    programIds.push(draft.id, pubCamp.id, openLeague.id);
    await setProgramStatus(pubCamp.id, 'published', 'system:verify');
    await setProgramStatus(openLeague.id, 'registration_open', 'system:verify');

    // 1. only public statuses listed
    const all = await listPublicPrograms();
    const mine = all.filter((p) => p.name.startsWith(tag));
    record('draft hidden, published/open shown', mine.length === 2 && !mine.some((p) => p.name.includes('Draft')), `${mine.length} public`);

    // 2. filters: category=Camps, type=camp, sport, age
    const camps = (await listPublicPrograms({ category: 'Camps' })).filter((p) => p.name.startsWith(tag));
    record('category filter', camps.length === 1 && camps[0].name.includes('Camp'), `${camps.length}`);
    const byType = (await listPublicPrograms({ typeKey: 'league' })).filter((p) => p.name.startsWith(tag));
    record('type filter', byType.length === 1 && byType[0].name.includes('League'), `${byType.length}`);
    const bySport = (await listPublicPrograms({ sport: 'basket' })).filter((p) => p.name.startsWith(tag));
    record('sport filter (ilike)', bySport.length === 1, `${bySport.length}`);
    const age10 = (await listPublicPrograms({ age: 10 })).filter((p) => p.name.startsWith(tag));
    const age20 = (await listPublicPrograms({ age: 20 })).filter((p) => p.name.startsWith(tag));
    record('age filter (8-12 camp matches 10 not 20)', age10.some((p) => p.name.includes('Camp')) && !age20.some((p) => p.name.includes('Camp')), `age10 ${age10.length}, age20 ${age20.length}`);

    // 3. share-token lookup
    const byToken = await getProgramByToken(pubCamp.share_token);
    record('share-token lookup', byToken?.id === pubCamp.id, `${byToken?.name}`);

    // 4. flow events + retargeting: in_cart drop surfaces, completed does not
    await logFlowEvent('browsing', { programId: pubCamp.id, email: `${tag}-a@x.test` });
    await logFlowEvent('in_cart', { programId: pubCamp.id, email: `${tag}-a@x.test` });
    await logFlowEvent('browsing', { programId: openLeague.id, email: `${tag}-b@x.test` });
    await logFlowEvent('in_cart', { programId: openLeague.id, email: `${tag}-b@x.test` });
    await logFlowEvent('completed', { programId: openLeague.id, email: `${tag}-b@x.test` });
    const retarget = (await retargetingList()).filter((r) => r.email?.startsWith(tag));
    record('retargeting: dropped in_cart only (not completed)', retarget.length === 1 && retarget[0].email === `${tag}-a@x.test`, `${retarget.length} to retarget`);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    await db.from('registration_flow_events').delete().like('email', `${tag}%`);
    for (const pid of programIds) { await db.from('registration_flow_events').delete().eq('program_id', pid); await db.from('programs').delete().eq('id', pid); }
    record('cleanup', true, 'programs + flow events removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
