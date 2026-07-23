import 'server-only';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Waiver editor + e-signatures (Module 3 Stage 5) — reused by Module 4.
 * Waivers are named, versioned templates; editing the body bumps the version
 * so already-signed instances keep the exact text they signed. A signature is
 * captured against an entity (rental now, program later) and gates confirming
 * the booking where a waiver is attached.
 */

export interface Waiver {
  id: number;
  name: string;
  body: string;
  version: number;
  active: boolean;
  default_for_booking_type: string | null;
}

export interface WaiverSignature {
  id: number;
  waiver_id: number;
  waiver_version: number;
  entity_type: 'rental' | 'program';
  entity_id: number;
  signer_name: string;
  signer_email: string | null;
  signature_text: string;
  signed_at: string;
}

const W_COLS = 'id, name, body, version, active, default_for_booking_type';
const S_COLS = 'id, waiver_id, waiver_version, entity_type, entity_id, signer_name, signer_email, signature_text, signed_at';

export async function listWaivers(includeInactive = false): Promise<Waiver[]> {
  let q = supabaseAdmin().from('waivers').select(W_COLS).order('name');
  if (!includeInactive) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Waiver[];
}

export async function getWaiver(id: number): Promise<Waiver | null> {
  const { data, error } = await supabaseAdmin().from('waivers').select(W_COLS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Waiver) ?? null;
}

export async function createWaiver(
  input: { name: string; body: string; defaultForBookingType?: string | null },
  actorClerkId: string,
): Promise<Waiver> {
  const { data, error } = await supabaseAdmin()
    .from('waivers')
    .insert({ name: input.name.trim(), body: input.body, default_for_booking_type: input.defaultForBookingType ?? null, created_by: actorClerkId })
    .select(W_COLS)
    .single();
  if (error) throw new Error(`waiver create failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'waiver.created', target: `waiver:${data.id}`, meta: { name: input.name } });
  return data as Waiver;
}

/**
 * Edit a waiver. Changing the BODY bumps the version (prior signatures retain
 * the version/text they signed); metadata-only edits keep the version.
 */
export async function updateWaiver(
  id: number,
  patch: { name?: string; body?: string; active?: boolean; defaultForBookingType?: string | null },
  actorClerkId: string,
): Promise<void> {
  const db = supabaseAdmin();
  const { data: cur, error } = await db.from('waivers').select('body, version').eq('id', id).single();
  if (error) throw new Error(error.message);
  const bodyChanged = patch.body !== undefined && patch.body !== cur.body;

  const { error: e2 } = await db
    .from('waivers')
    .update({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
      ...(patch.defaultForBookingType !== undefined ? { default_for_booking_type: patch.defaultForBookingType } : {}),
      ...(bodyChanged ? { version: cur.version + 1 } : {}),
    })
    .eq('id', id);
  if (e2) throw new Error(`waiver update failed: ${e2.message}`);
  await audit({ actorId: actorClerkId, action: 'waiver.updated', target: `waiver:${id}`, meta: { bodyChanged, newVersion: bodyChanged ? cur.version + 1 : cur.version } });
}

/** Capture an e-signature (typed full name) against an entity. */
export async function signWaiver(input: {
  waiverId: number;
  entityType: 'rental' | 'program';
  entityId: number;
  signerName: string;
  signerEmail?: string | null;
  signerProfileId?: number | null;
  signatureText: string;
  ipHint?: string | null;
}): Promise<WaiverSignature> {
  const waiver = await getWaiver(input.waiverId);
  if (!waiver) throw new Error('Waiver not found.');
  if (input.signatureText.trim().length < 2) throw new Error('Please type your full name to sign.');

  const { data, error } = await supabaseAdmin()
    .from('waiver_signatures')
    .insert({
      waiver_id: input.waiverId,
      waiver_version: waiver.version,
      entity_type: input.entityType,
      entity_id: input.entityId,
      signer_name: input.signerName.trim(),
      signer_email: input.signerEmail ?? null,
      signer_profile_id: input.signerProfileId ?? null,
      signature_text: input.signatureText.trim(),
      ip_hint: input.ipHint ?? null,
    })
    .select(S_COLS)
    .single();
  if (error) throw new Error(`signature failed: ${error.message}`);
  await audit({
    actorId: input.signerProfileId ? `profile:${input.signerProfileId}` : 'public:signer',
    action: 'waiver.signed',
    target: `${input.entityType}:${input.entityId}`,
    meta: { waiver_id: input.waiverId, version: waiver.version, signer: input.signerName },
  });
  return data as WaiverSignature;
}

/** Latest signature for an entity's attached waiver (null = unsigned). */
export async function signatureFor(entityType: 'rental' | 'program', entityId: number, waiverId: number): Promise<WaiverSignature | null> {
  const { data, error } = await supabaseAdmin()
    .from('waiver_signatures')
    .select(S_COLS)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('waiver_id', waiverId)
    .order('signed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as WaiverSignature) ?? null;
}

/**
 * The confirm-gate: is the entity's attached waiver signed at the CURRENT
 * version? Unsigned or signed-at-an-older-version both block confirmation.
 */
export async function isWaiverSatisfied(entityType: 'rental' | 'program', entityId: number, waiverId: number | null): Promise<boolean> {
  if (!waiverId) return true; // no waiver attached -> nothing to sign
  const [waiver, sig] = await Promise.all([getWaiver(waiverId), signatureFor(entityType, entityId, waiverId)]);
  if (!waiver || !sig) return false;
  return sig.waiver_version === waiver.version;
}

export async function attachWaiverToRental(rentalId: number, waiverId: number | null, actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('rentals').update({ waiver_id: waiverId }).eq('id', rentalId);
  if (error) throw new Error(`attach waiver failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'rental.waiver-attached', target: `rental:${rentalId}`, meta: { waiver_id: waiverId } });
}

// --- Program waivers (Module 4 Stage 6) -------------------------------------
// Programs sign ONE waiver per FAMILY per program (not per participant), valid
// for 1 year before a re-sign is required.

export const WAIVER_VALIDITY_DAYS = 365;

export async function attachWaiverToProgram(programId: number, waiverId: number | null, actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('programs').update({ waiver_id: waiverId }).eq('id', programId);
  if (error) throw new Error(`attach waiver failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'program.waiver-attached', target: `program:${programId}`, meta: { waiver_id: waiverId } });
}

/** Family's signature for a program waiver (keyed by HoH signer), latest first. */
export async function familyProgramSignature(programId: number, hohProfileId: number, waiverId: number): Promise<WaiverSignature | null> {
  const { data, error } = await supabaseAdmin()
    .from('waiver_signatures')
    .select(S_COLS)
    .eq('entity_type', 'program')
    .eq('entity_id', programId)
    .eq('waiver_id', waiverId)
    .eq('signer_profile_id', hohProfileId)
    .order('signed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as WaiverSignature) ?? null;
}

/**
 * Is the program's attached waiver satisfied for a family? Requires a signature
 * by the family's HoH at the current version AND within the 1-year validity.
 */
export async function isProgramWaiverSatisfied(programId: number, familyId: number | null): Promise<boolean> {
  const db = supabaseAdmin();
  const { data: program } = await db.from('programs').select('waiver_id').eq('id', programId).maybeSingle();
  const waiverId = program?.waiver_id as number | null | undefined;
  if (!waiverId) return true;           // no waiver attached
  if (!familyId) return false;          // waiver required but no family to sign
  const { data: fam } = await db.from('families').select('hoh_profile_id').eq('id', familyId).single();
  if (!fam?.hoh_profile_id) return false;

  const [waiver, sig] = await Promise.all([getWaiver(waiverId), familyProgramSignature(programId, fam.hoh_profile_id, waiverId)]);
  if (!waiver || !sig) return false;
  if (sig.waiver_version !== waiver.version) return false;
  const ageDays = (Date.now() - Date.parse(sig.signed_at)) / 86400_000;
  return ageDays <= WAIVER_VALIDITY_DAYS;
}
