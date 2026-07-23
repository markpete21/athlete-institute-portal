import 'server-only';
import { aggregateGearOrder, audit, isJerseySize, resolveJerseyNumber, type GearOrderLine } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Products/variants + jersey gear ordering (Module 4 Stage 5). The aggregation
 * + number-dedup math is pure in @ai/foundation/gear; this persists products,
 * per-registrant sizing, and builds the supplier order.
 */

export async function createProduct(input: { name: string; description?: string | null; isGear?: boolean; variants: Array<{ label: string; priceCents: number }> }, actorClerkId: string): Promise<number> {
  const db = supabaseAdmin();
  const { data, error } = await db.from('products').insert({ name: input.name.trim(), description: input.description ?? null, is_gear: input.isGear ?? false }).select('id').single();
  if (error) throw new Error(`product create failed: ${error.message}`);
  if (input.variants.length) {
    const { error: vErr } = await db.from('product_variants').insert(input.variants.map((v, i) => ({ product_id: data.id, label: v.label, price_cents: v.priceCents, sort_order: i })));
    if (vErr) throw new Error(vErr.message);
  }
  await audit({ actorId: actorClerkId, action: 'product.created', target: `product:${data.id}`, meta: { name: input.name } });
  return data.id;
}

export async function offerProduct(programId: number, productId: number, required: boolean, actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('program_products').upsert({ program_id: programId, product_id: productId, required }, { onConflict: 'program_id,product_id' });
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'program.product-offered', target: `program:${programId}`, meta: { product_id: productId } });
}

/** Set a registrant's jersey size + number choices; auto-assigns a non-dup number. */
export async function setJerseySelection(input: { registrationId: number; programId: number; size: string; firstChoice?: number | null; secondChoice?: number | null }): Promise<{ assigned: number | null }> {
  const db = supabaseAdmin();
  if (!isJerseySize(input.size)) throw new Error(`Invalid jersey size: ${input.size}`);

  const { data: program } = await db.from('programs').select('jersey_numbers_enabled').eq('id', input.programId).single();
  let assigned: number | null = null;
  if (program?.jersey_numbers_enabled) {
    // Numbers already taken on this team (other active registrations).
    const { data: taken } = await db
      .from('registrations')
      .select('jersey_number')
      .eq('program_id', input.programId)
      .neq('id', input.registrationId)
      .not('jersey_number', 'is', null);
    const takenNums = (taken ?? []).map((t) => t.jersey_number as number);
    const r = resolveJerseyNumber(takenNums, input.firstChoice ?? null, input.secondChoice ?? null);
    if (r.assigned == null && (input.firstChoice != null || input.secondChoice != null)) {
      throw new Error('Both number choices are taken on this team — please pick another.');
    }
    assigned = r.assigned;
  }

  const { error } = await db
    .from('registrations')
    .update({ jersey_size: input.size, jersey_number: assigned, jersey_number_2: input.secondChoice ?? null })
    .eq('id', input.registrationId);
  if (error) throw new Error(`jersey save failed: ${error.message}`);
  return { assigned };
}

export async function setJerseyExtras(programId: number, extras: Record<string, number>, actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('programs').update({ jersey_extras: extras }).eq('id', programId);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'program.jersey-extras', target: `program:${programId}`, meta: { extras } });
}

/** Build the aggregated supplier order for a program (sizes picked + extras). */
export async function buildGearOrder(programId: number): Promise<{ lines: GearOrderLine[]; programName: string }> {
  const db = supabaseAdmin();
  const { data: program } = await db.from('programs').select('name, jersey_extras').eq('id', programId).single();
  const { data: regs } = await db.from('registrations').select('jersey_size').eq('program_id', programId).eq('status', 'active').not('jersey_size', 'is', null);
  const sizes = (regs ?? []).map((r) => r.jersey_size as string);
  return { lines: aggregateGearOrder(sizes, (program?.jersey_extras ?? {}) as Record<string, number>), programName: program?.name ?? 'Program' };
}
