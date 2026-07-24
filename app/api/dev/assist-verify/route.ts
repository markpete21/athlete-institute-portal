import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';
import { checkRateLimit, runAssist, type CallModel } from '@/lib/assist/core';
import { TOOLS_BY_SURFACE } from '@/lib/assist/tools';

/**
 * DEV-ONLY: Module 21 - scope enforcement (public tools expose no personal
 * data; customer sees only own household; admin gated), grounded tool layer
 * against live data, tool-loop plumbing (mock model), navigate-to-spot, rate
 * limiting, read-only registry. Model-quality (voice/no-invention prose) needs
 * ANTHROPIC_API_KEY and is exercised in staging.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const programIds: number[] = [];
  let famId: number | null = null;
  const rateKeys: string[] = [];

  try {
    // Live catalog fixture.
    const league = (await listProgramTypes()).find((t) => t.key === 'league')!;
    const prog = await createProgram({ name: 'Assist U10 Volleyball', programTypeId: league.id, actorClerkId: 'system:verify' });
    programIds.push(prog.id);
    await db.from('programs').update({ status: 'registration_open', base_price_cents: 25000, min_age: 8, max_age: 12, description: 'August volleyball fun' }).eq('id', prog.id);

    const { data: fam } = await db.from('families').insert({ name: 'Assist Fam', play_points_balance: 321 }).select('id').single();
    famId = fam!.id;
    const { data: mem } = await db.from('family_members').insert({ family_id: famId, first_name: 'Ella', last_name: 'K', member_role: 'dependent' }).select('id').single();
    await db.from('registrations').insert({ program_id: prog.id, family_id: famId, family_member_id: mem!.id, status: 'active', standing: 'brand_new' });

    // 1. public tool registry has NO personal-data tools (scope by construction)
    const publicToolNames = TOOLS_BY_SURFACE.public.map((t) => t.name);
    record('public surface exposes catalog tools only', publicToolNames.every((n) => !n.startsWith('my_') && !['unpaid_balances', 'program_stats'].includes(n)), publicToolNames.join(','));

    // 2. grounded retrieval: list_programs returns the live program (age filter works)
    const list = await TOOLS_BY_SURFACE.public.find((t) => t.name === 'list_programs')!.run({ keyword: 'volleyball', age: 10 }, {});
    const rows = list as Array<{ id: number; price: string; registerUrl: string }>;
    record('catalog tool returns live data + register link', rows.some((r) => r.id === prog.id && r.price === '$250.00' && r.registerUrl === `/p/${prog.id}`), JSON.stringify(rows[0] ?? null));
    const miss = await TOOLS_BY_SURFACE.public.find((t) => t.name === 'list_programs')!.run({ keyword: 'zorbing' }, {});
    record('unknown program -> empty retrieval (nothing to invent from)', Array.isArray(miss) && miss.length === 0, `${(miss as unknown[]).length} results`);

    // 3. customer tools scoped to the caller's own household
    const myRegs = await TOOLS_BY_SURFACE.customer.find((t) => t.name === 'my_registrations')!.run({}, { familyId: famId });
    record('customer tool returns own household only', (myRegs as unknown[]).length === 1, JSON.stringify(myRegs));
    let noFamilyBlocked = false;
    try { await TOOLS_BY_SURFACE.customer.find((t) => t.name === 'my_balance')!.run({}, {}); } catch { noFamilyBlocked = true; }
    record('customer tool without household errors (no leakage)', noFamilyBlocked, `blocked=${noFamilyBlocked}`);

    // 4. admin tools staff-gated
    let adminBlocked = false;
    try { await TOOLS_BY_SURFACE.admin.find((t) => t.name === 'unpaid_balances')!.run({}, { isStaff: false }); } catch { adminBlocked = true; }
    const nav = await TOOLS_BY_SURFACE.admin.find((t) => t.name === 'navigate')!.run({ spot: 'take me to conflicts' }, { isStaff: true });
    record('admin tools staff-gated + navigate resolves route', adminBlocked && (nav as { route: string }).route === '/conflicts', JSON.stringify(nav));

    // 5. the loop: mock model calls a tool then answers (tool_use plumbing)
    const mockModel: CallModel = async ({ messages }) => {
      const hasToolResult = (messages as Array<{ content: unknown }>).some((m) => Array.isArray(m.content) && (m.content as Array<{ type: string }>).some((c) => c.type === 'tool_result'));
      if (!hasToolResult) {
        return { content: [{ type: 'tool_use', id: 'tu_1', name: 'list_programs', input: { keyword: 'volleyball' } }], stop_reason: 'tool_use' };
      }
      return { content: [{ type: 'text', text: 'Found Assist U10 Volleyball, $250.00, ages 8-12.' }], stop_reason: 'end_turn' };
    };
    const rk1 = `test:${prog.id}:loop`;
    rateKeys.push(rk1);
    const result = await runAssist('public', rk1, [{ role: 'user', content: 'volleyball for my 10 year old?' }], {}, { callModel: mockModel });
    record('tool loop: model->tool->model->answer', result.toolCalls === 1 && result.reply.includes('$250.00'), `${result.toolCalls} calls: ${result.reply.slice(0, 50)}`);

    // 6. model failure -> honest handoff w/ human contact (never a guess)
    const failModel: CallModel = async () => { throw new Error('api down'); };
    const rk2 = `test:${prog.id}:fail`;
    rateKeys.push(rk2);
    const failed = await runAssist('public', rk2, [{ role: 'user', content: 'hi' }], {}, { callModel: failModel });
    record('failure path hands off to a human (text/call/email)', failed.handedOff && failed.reply.includes('519-941-0492'), failed.reply.slice(0, 80));

    // 7. rate limiting: burn the public hourly limit
    const rk3 = `test:${prog.id}:rate`;
    rateKeys.push(rk3);
    const { limit } = await checkRateLimit('public', rk3);
    const logs = Array.from({ length: limit }, () => ({ surface: 'public', rate_key: rk3, question: 'x', answered: true }));
    await db.from('assist_logs').insert(logs);
    const limited = await runAssist('public', rk3, [{ role: 'user', content: 'one more?' }], {}, { callModel: mockModel });
    record('rate limit enforced after hourly cap', limited.toolCalls === 0 && limited.handedOff, limited.reply.slice(0, 60));

    // 8. every registered tool is read-only (none mutate; framework action-ready later)
    const allNames = [...new Set(Object.values(TOOLS_BY_SURFACE).flat().map((t) => t.name))];
    record('read-only tool registry (no action tools yet)', allNames.every((n) => !/create|update|delete|pay|register|send/.test(n)), allNames.join(','));

    // 9. queries logged for audit + rate accounting
    const { count: logged } = await db.from('assist_logs').select('id', { count: 'exact', head: true }).eq('rate_key', rk1);
    record('assist queries logged', (logged ?? 0) === 1, `${logged}`);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (rateKeys.length) await db.from('assist_logs').delete().in('rate_key', rateKeys);
    if (programIds.length) { await db.from('registrations').delete().in('program_id', programIds); await db.from('programs').delete().in('id', programIds); }
    if (famId) { await db.from('family_members').delete().eq('family_id', famId); await db.from('families').delete().eq('id', famId); }
    record('cleanup', true, 'programs, family, logs removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
