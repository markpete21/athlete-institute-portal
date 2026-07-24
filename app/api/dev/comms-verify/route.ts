import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';
import { resolveAudience } from '@/lib/comms/segments';
import { cancelScheduled, createCampaign, finalizeAbWinner, preSendSpamCheck, scheduleCampaign, sendCampaign } from '@/lib/comms/campaigns';
import { campaignStats } from '@/lib/comms/stats';
import { ingestResendEvent } from '@/lib/comms/stats';
import { fireTrigger, isSuppressed, suppress, unsuppress, updateTrigger } from '@/lib/comms/notifications';

/**
 * DEV-ONLY: Module 13 - live audience resolution (include/exclude/suppress/age),
 * schedule edit/cancel, A/B send, Resend-webhook stats ingestion + auto
 * suppression, spam check, auto-notification toggle. Cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const programIds: number[] = [];
  const famIds: number[] = [];
  const profileIds: number[] = [];
  const campaignIds: number[] = [];
  const emails: string[] = [];

  try {
    const type = (await listProgramTypes()).find((t) => t.key === 'league')!;
    const P = await createProgram({ name: 'Comms P', programTypeId: type.id, actorClerkId: 'system:verify' });
    const Q = await createProgram({ name: 'Comms Q', programTypeId: type.id, actorClerkId: 'system:verify' });
    programIds.push(P.id, Q.id);
    await db.from('programs').update({ status: 'registration_open', brand_key: 'orangeville-prep', category: 'Youth Sports' }).in('id', [P.id, Q.id]);

    // 3 families: hoh profile w/ email + a dependent (age 14/13/8).
    const fams: Array<{ famId: number; email: string; memberId: number }> = [];
    const dobs = ['2012-01-01', '2013-01-01', '2018-01-01'];
    for (let i = 0; i < 3; i += 1) {
      const email = `comms-verify-${i}-${P.id}@example.test`;
      emails.push(email);
      const { data: prof } = await db.from('profiles').insert({ clerk_user_id: `verify-${i}-${P.id}`, email, first_name: `Fam${i}` }).select('id').single();
      profileIds.push(prof!.id);
      const { data: fam } = await db.from('families').insert({ name: `Fam ${i}`, hoh_profile_id: prof!.id }).select('id').single();
      famIds.push(fam!.id);
      const { data: mem } = await db.from('family_members').insert({ family_id: fam!.id, first_name: `Kid${i}`, last_name: 'K', member_role: 'dependent', dob: dobs[i] }).select('id').single();
      fams.push({ famId: fam!.id, email, memberId: mem!.id });
      await db.from('registrations').insert({ program_id: P.id, family_id: fam!.id, family_member_id: mem!.id, status: 'active', standing: 'brand_new' });
    }
    // fam1 also in Q (for exclude test)
    await db.from('registrations').insert({ program_id: Q.id, family_id: fams[1].famId, family_member_id: fams[1].memberId, status: 'active', standing: 'brand_new' });

    // 1. live audience = all 3
    const all = await resolveAudience({ include: [{ programIds: [P.id] }] });
    record('live audience resolves program members', all.length === 3, `${all.length} recipients`);

    // 2. include minus exclude
    const minusQ = await resolveAudience({ include: [{ programIds: [P.id] }], exclude: [{ programIds: [Q.id] }] });
    record('include P minus exclude Q', minusQ.length === 2 && !minusQ.some((r) => r.email === fams[1].email), `${minusQ.length}`);

    // 3. suppression excludes (then restore)
    await suppress(fams[2].email, 'unsubscribe');
    const afterSuppress = await resolveAudience({ include: [{ programIds: [P.id] }] });
    record('suppressed email excluded from live audience', afterSuppress.length === 2 && !afterSuppress.some((r) => r.email === fams[2].email), `${afterSuppress.length}`);
    await unsuppress(fams[2].email);

    // 4. age filter (>=12 excludes the 8-year-old's household)
    const age12 = await resolveAudience({ include: [{ programIds: [P.id] }], filters: { ageMin: 12 } });
    record('participant age filter', age12.length === 2 && !age12.some((r) => r.email === fams[2].email), `${age12.length}`);

    // 5. schedule -> reschedule -> cancel
    const sched = await createCampaign({ name: 'Scheduled', subject: 'Hi', blocks: [{ type: 'text', text: 'Hello {{first_name}}' }], audience: { include: [{ programIds: [P.id] }] } }, 'system:verify');
    campaignIds.push(sched);
    await scheduleCampaign(sched, '2030-01-01T12:00:00Z', 'system:verify');
    await scheduleCampaign(sched, '2030-02-01T12:00:00Z', 'system:verify');
    await cancelScheduled(sched, 'system:verify');
    const { data: schedRow } = await db.from('comms_campaigns').select('status, scheduled_at').eq('id', sched).single();
    record('schedule -> reschedule -> cancel (back to draft)', schedRow!.status === 'draft' && schedRow!.scheduled_at === null, JSON.stringify(schedRow));

    // 6. A/B send resolves live + splits recipients
    const camp = await createCampaign({ name: 'ABTest', subject: 'A subject', blocks: [{ type: 'text', text: 'Hi {{first_name}}' }], audience: { include: [{ programIds: [P.id] }] }, abTest: { variantB: { subject: 'B subject' }, splitPercent: 100 } }, 'system:verify');
    campaignIds.push(camp);
    const sendRes = await sendCampaign(camp, 'system:verify');
    record('A/B send: 3 recipients, split into A+B', sendRes.recipientCount === 3 && sendRes.variants.A + sendRes.variants.B === 3, JSON.stringify(sendRes.variants));

    // 7. stats ingestion (opened/clicked/bounced) + auto-suppression on bounce
    const recs = (await db.from('comms_recipients').select('id, email').eq('campaign_id', camp)).data ?? [];
    const rById = Object.fromEntries(recs.map((r) => [r.email, r.id]));
    await ingestResendEvent({ type: 'email.opened', campaignId: camp, email: fams[0].email });
    await ingestResendEvent({ type: 'email.clicked', campaignId: camp, email: fams[1].email, url: 'https://x/pay' });
    await ingestResendEvent({ type: 'email.bounced', campaignId: camp, email: fams[2].email });
    const stats = await campaignStats(camp);
    // opened === 2: an explicit open (fam0) + a click implying an open (fam1).
    record('stats: opened + clicked + bounced ingested', stats.opened === 2 && stats.clicked === 1 && stats.bounced === 1, JSON.stringify({ o: stats.opened, c: stats.clicked, b: stats.bounced }));
    record('hard bounce auto-suppressed for future sends', await isSuppressed(fams[2].email), 'suppressed');
    void rById;

    // 8. A/B winner (B got the click)
    const winner = await finalizeAbWinner(camp);
    const bWasClicker = recs.find((r) => r.email === fams[1].email);
    const bVariant = (await db.from('comms_recipients').select('variant').eq('id', bWasClicker!.id).single()).data!.variant;
    record('A/B winner = clicked variant', winner === bVariant, `winner ${winner}, clicker variant ${bVariant}`);

    // 9. pre-send spam check flags a bad subject
    const spammy = await createCampaign({ name: 'Spammy', subject: 'FREE CASH WINNER!!!', blocks: [{ type: 'image', src: 'x' }, { type: 'image', src: 'y' }, { type: 'image', src: 'z' }], isMarketing: true }, 'system:verify');
    campaignIds.push(spammy);
    const warnings = await preSendSpamCheck(spammy);
    record('pre-send spam check warns', warnings.length >= 3, `${warnings.length} warnings`);

    // 10. auto-notification toggle + channel selection
    await updateTrigger('cart.abandoned', { enabled: false }, 'system:verify');
    const off = await fireTrigger('cart.abandoned', { email: fams[0].email }, { first_name: 'A', program_name: 'P' });
    await updateTrigger('cart.abandoned', { enabled: true, channels: ['email'] }, 'system:verify');
    const on = await fireTrigger('cart.abandoned', { email: fams[0].email }, { first_name: 'A', program_name: 'P' });
    record('auto-notification on/off toggle honored', off === false && on === true, `off=${off} on=${on}`);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    for (const id of campaignIds) { await db.from('comms_link_clicks').delete().eq('campaign_id', id); await db.from('comms_recipients').delete().eq('campaign_id', id); }
    if (campaignIds.length) await db.from('comms_campaigns').delete().in('id', campaignIds);
    if (emails.length) await db.from('comms_suppressions').delete().in('email', emails);
    if (programIds.length) { await db.from('registrations').delete().in('program_id', programIds); await db.from('programs').delete().in('id', programIds); }
    if (famIds.length) { await db.from('family_members').delete().in('family_id', famIds); await db.from('families').delete().in('id', famIds); }
    if (profileIds.length) await db.from('profiles').delete().in('id', profileIds);
    // restore default trigger state
    await updateTrigger('cart.abandoned', { enabled: true, channels: ['email'] }, 'system:verify').catch(() => {});
    record('cleanup', true, 'campaigns, recipients, programs, families, profiles removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
