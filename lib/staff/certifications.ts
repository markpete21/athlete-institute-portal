import 'server-only';
import {
  audit,
  torontoToday,
} from '@ai/foundation';
import { notify } from '@ai/foundation/notify';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { Staff } from '@/lib/staff/records';

/**
 * Staff certifications (Module 5): certification types, per-staff certs with
 * expiry, per-program role requirements, held-vs-outstanding derivation, and
 * the expiry warning sweep (warn-only, never blocks assignment).
 */

// --- Certifications ---------------------------------------------------------

export interface CertType {
  id: number;
  name: string;
  description: string | null;
  validity_months: number | null;
  active: boolean;
  sort_order: number;
}

export async function listCertTypes(includeInactive = false): Promise<CertType[]> {
  let q = supabaseAdmin().from('staff_certification_types').select('id, name, description, validity_months, active, sort_order').order('sort_order').order('name');
  if (!includeInactive) q = q.eq('active', true);
  const { data } = await q;
  return (data ?? []) as CertType[];
}

export async function createCertType(input: { name: string; description?: string | null; validityMonths?: number | null }, actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('staff_certification_types').insert({ name: input.name.trim(), description: input.description?.trim() || null, validity_months: input.validityMonths ?? null, sort_order: 100 });
  if (error) throw new Error(error.message.includes('duplicate') ? 'That certification already exists.' : error.message);
  await audit({ actorId: actorClerkId, action: 'staff.cert-type-created', target: 'staff_certification_types', meta: { name: input.name } });
}

export async function updateCertType(id: number, input: { description?: string | null; validityMonths?: number | null; active?: boolean }, actorClerkId: string): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.validityMonths !== undefined) patch.validity_months = input.validityMonths;
  if (input.active !== undefined) patch.active = input.active;
  if (!Object.keys(patch).length) return;
  const { error } = await supabaseAdmin().from('staff_certification_types').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'staff.cert-type-updated', target: `staff_certification_type:${id}`, meta: patch });
}

const addMonthsISO = (iso: string, months: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
};

/**
 * Record that a staff member OBTAINED a certification. The expiry date is
 * required (Mark's rule) - when the catalog type carries a validity period
 * and an obtained date is given, it's computed automatically; otherwise the
 * caller must supply it.
 */
export async function addCertification(input: { staffId: number; certTypeId?: number | null; name?: string | null; obtainedOn?: string | null; expiresOn?: string | null }, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  let name = input.name?.trim() || '';
  let expiresOn = input.expiresOn || null;

  if (input.certTypeId) {
    const { data: type } = await db.from('staff_certification_types').select('name, validity_months').eq('id', input.certTypeId).single();
    if (!type) throw new Error('Unknown certification type.');
    name = type.name;
    if (!expiresOn && type.validity_months && input.obtainedOn) expiresOn = addMonthsISO(input.obtainedOn, type.validity_months);
  }
  if (!name) throw new Error('Pick a certification.');
  if (!expiresOn) throw new Error('Set the expiry date (or the obtained date, for certs with a standard validity period).');

  const { error } = await db.from('staff_certifications').insert({ staff_id: input.staffId, cert_type_id: input.certTypeId ?? null, name, obtained_on: input.obtainedOn ?? null, expires_on: expiresOn });
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'staff.cert-added', target: `staff:${input.staffId}`, meta: { name, expires_on: expiresOn } });
}

// --- Per-program role requirements --------------------------------------------

export async function setProgramRoleCert(programId: number, roleLabel: string, certTypeId: number, required: boolean, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  if (required) {
    const { error } = await db.from('program_role_certifications').upsert({ program_id: programId, role_label: roleLabel, cert_type_id: certTypeId }, { onConflict: 'program_id,role_label,cert_type_id' });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db.from('program_role_certifications').delete().eq('program_id', programId).eq('role_label', roleLabel).eq('cert_type_id', certTypeId);
    if (error) throw new Error(error.message);
  }
  await audit({ actorId: actorClerkId, action: 'program.role-cert-set', target: `program:${programId}`, meta: { role_label: roleLabel, cert_type_id: certTypeId, required } });
}

export async function programRoleCerts(programId: number): Promise<Array<{ role_label: string; cert_type_id: number }>> {
  const { data } = await supabaseAdmin().from('program_role_certifications').select('role_label, cert_type_id').eq('program_id', programId);
  return data ?? [];
}

// --- Held vs outstanding (derived) ---------------------------------------------

export interface StaffCertStatus {
  held: Array<{ name: string; expiresOn: string | null; state: 'ok' | 'expiring' | 'expired' }>;
  outstanding: Array<{ name: string; roleLabel: string; programName: string; expired: boolean }>;
}

/**
 * Per staff: the certifications they hold (with expiry state) and the ones
 * OUTSTANDING - required by an active assignment's role on a program but not
 * held, or held but expired. Derived live, never stored.
 */
export async function staffCertStatuses(staffIds: number[]): Promise<Map<number, StaffCertStatus>> {
  const out = new Map<number, StaffCertStatus>();
  if (!staffIds.length) return out;
  const db = supabaseAdmin();
  const today = torontoToday();
  const soon = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

  const [{ data: certs }, { data: assigns }] = await Promise.all([
    db.from('staff_certifications').select('staff_id, name, cert_type_id, expires_on').in('staff_id', staffIds),
    db.from('staff_assignments').select('staff_id, role_label, program_id, programs(name)').in('staff_id', staffIds).eq('active', true).not('role_label', 'is', null),
  ]);

  const programIds = [...new Set((assigns ?? []).map((a) => a.program_id))];
  const { data: reqs } = programIds.length
    ? await db.from('program_role_certifications').select('program_id, role_label, cert_type_id, staff_certification_types(name)').in('program_id', programIds)
    : { data: [] as never[] };
  const reqByProgramRole = new Map<string, Array<{ certTypeId: number; certName: string }>>();
  for (const r of (reqs ?? []) as Array<{ program_id: number; role_label: string; cert_type_id: number; staff_certification_types: unknown }>) {
    const key = `${r.program_id}:${r.role_label}`;
    const name = (r.staff_certification_types as { name: string } | null)?.name ?? 'Certification';
    reqByProgramRole.set(key, [...(reqByProgramRole.get(key) ?? []), { certTypeId: r.cert_type_id, certName: name }]);
  }

  for (const staffId of staffIds) {
    const mine = (certs ?? []).filter((c) => c.staff_id === staffId);
    const held: StaffCertStatus['held'] = mine.map((c) => ({
      name: c.name,
      expiresOn: c.expires_on,
      state: !c.expires_on ? 'ok' : c.expires_on < today ? 'expired' : c.expires_on <= soon ? 'expiring' : 'ok',
    }));
    const validTypeIds = new Set(mine.filter((c) => c.cert_type_id && (!c.expires_on || c.expires_on >= today)).map((c) => c.cert_type_id as number));
    const validNames = new Set(mine.filter((c) => !c.expires_on || c.expires_on >= today).map((c) => c.name));
    const expiredTypeIds = new Set(mine.filter((c) => c.cert_type_id && c.expires_on && c.expires_on < today).map((c) => c.cert_type_id as number));

    const outstanding: StaffCertStatus['outstanding'] = [];
    const seen = new Set<string>();
    for (const a of (assigns ?? []).filter((a) => a.staff_id === staffId)) {
      const needs = reqByProgramRole.get(`${a.program_id}:${a.role_label}`) ?? [];
      for (const need of needs) {
        if (validTypeIds.has(need.certTypeId) || validNames.has(need.certName)) continue;
        const dedupe = `${need.certTypeId}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        outstanding.push({
          name: need.certName,
          roleLabel: a.role_label!,
          programName: (a.programs as unknown as { name: string } | null)?.name ?? '—',
          expired: expiredTypeIds.has(need.certTypeId),
        });
      }
    }
    if (held.length || outstanding.length) out.set(staffId, { held, outstanding });
  }
  return out;
}

export async function deleteCertification(certId: number, actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('staff_certifications').delete().eq('id', certId);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'staff.cert-removed', target: `staff_certification:${certId}` });
}

/** Warn-only cert expiry notices (cron). Never blocks assignment. */
export async function processCertExpiries(): Promise<{ warned: number }> {
  const db = supabaseAdmin();
  const soon = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  const { data: due } = await db
    .from('staff_certifications')
    .select('id, name, expires_on, staff(first_name, last_name, email)')
    .not('expires_on', 'is', null)
    .lte('expires_on', soon)
    .is('reminded_at', null);
  let warned = 0;
  for (const c of due ?? []) {
    const s = c.staff as unknown as { first_name: string; last_name: string; email: string | null };
    await notify({
      to: { email: process.env.OPERATIONS_EMAIL ?? 'mark.peterson@athleteinstitute.ca' },
      channels: ['email'],
      template: 'generic',
      data: { heading: 'Staff certification expiring', body: `${s.first_name} ${s.last_name}'s "${c.name}" expires ${c.expires_on}. Please follow up on renewal (assignments are not blocked).`, ctaLabel: 'Open staff', ctaUrl: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://admin.athleteinstitute.ca'}/staff` },
    });
    await db.from('staff_certifications').update({ reminded_at: new Date().toISOString() }).eq('id', c.id);
    warned++;
  }
  return { warned };
}
