import 'server-only';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { notify } from '@ai/foundation/notify';
import { getSite, siteOrigin } from '@/lib/site/sites';

/**
 * Forms on the public site: interest sign-ups ("notify me when registration
 * opens"), location requests, hosting enquiries, training requests and the
 * confidential assistance request. Every row keeps the exact consent wording
 * (CASL record). Nothing here is ever labelled registration.
 */

export type LeadKind = 'interest' | 'request' | 'host' | 'contact' | 'assistance' | 'apply';

export interface LeadInput {
  kind: LeadKind;
  email: string;
  name?: string;
  phone?: string;
  fields?: Record<string, string>;
  consent: boolean;
  consentText: string;
  sourcePath?: string;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function createLead(brandKey: string, input: LeadInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, error: 'Enter a valid email address.' };
  if (!input.consent) return { ok: false, error: 'Tick the box so we can email you.' };
  const db = supabaseAdmin();
  // Soft rate limit: 5 per email per hour across kinds.
  const { count } = await db.from('site_leads').select('id', { count: 'exact', head: true }).eq('brand_key', brandKey).eq('email', email).gte('created_at', new Date(Date.now() - 3_600_000).toISOString());
  if ((count ?? 0) >= 5) return { ok: false, error: 'That\'s a few in a row. Try again in an hour.' };
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.fields ?? {})) if (typeof v === 'string' && v.trim()) fields[k.slice(0, 40)] = v.trim().slice(0, 1000);
  const { error } = await db.from('site_leads').insert({
    brand_key: brandKey, kind: input.kind, email, name: input.name?.trim().slice(0, 120) || null, phone: input.phone?.trim().slice(0, 40) || null,
    fields, consent: true, consent_text: input.consentText.slice(0, 500), source_path: input.sourcePath?.slice(0, 200) ?? null,
  });
  if (error) return { ok: false, error: 'Something went wrong. Please try again.' };

  const site = await getSite(brandKey);
  if (site) {
    const origin = siteOrigin(site);
    const legal = site.contact.legal_name ?? site.name;
    const address = site.contact.address ?? '';
    if (input.kind === 'interest') {
      await notify({ to: { email }, channels: ['email'], brandKey, template: 'site.interest', data: { siteName: site.name, context: fields.program || fields.context || site.name, siteUrl: origin, legalName: legal, address } }).catch(() => {});
    }
    // Staff copy for requests and enquiries (never for the confidential assistance form's details).
    const inbox = site.contact.email;
    if (inbox && input.kind !== 'interest') {
      const summary = input.kind === 'assistance'
        ? `A confidential financial assistance request was received from ${email}. Open Websites > Leads to review it.`
        : `${input.kind === 'host' ? 'Hosting enquiry' : input.kind === 'request' ? 'Location request' : 'Message'} from ${input.name ?? email} (${email}${input.phone ? `, ${input.phone}` : ''}).\n\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n')}`;
      await notify({ to: { email: inbox }, channels: ['email'], brandKey, template: 'generic', data: { heading: `${site.name}: new ${input.kind} from the website`, body: summary, ctaLabel: 'Open leads', ctaUrl: `${origin}/admin/leads` } }).catch(() => {});
    }
  }
  return { ok: true };
}

export interface LeadRow { id: number; kind: LeadKind; email: string; name: string | null; phone: string | null; fields: Record<string, string>; createdAt: string; status: string; sourcePath: string | null }

export async function listLeads(brandKey: string, kind?: LeadKind, limit = 200): Promise<LeadRow[]> {
  let q = supabaseAdmin().from('site_leads').select('id, kind, email, name, phone, fields, created_at, status, source_path').eq('brand_key', brandKey).order('created_at', { ascending: false }).limit(limit);
  if (kind) q = q.eq('kind', kind);
  const { data } = await q;
  return (data ?? []).map((r) => ({ id: r.id, kind: r.kind, email: r.email, name: r.name, phone: r.phone, fields: (r.fields ?? {}) as Record<string, string>, createdAt: r.created_at, status: r.status, sourcePath: r.source_path }));
}

export async function leadCounts(brandKey: string, sinceDays = 30): Promise<Record<string, number>> {
  const { data } = await supabaseAdmin().from('site_leads').select('kind, fields').eq('brand_key', brandKey).gte('created_at', new Date(Date.now() - sinceDays * 86_400_000).toISOString());
  const out: Record<string, number> = {};
  for (const r of data ?? []) {
    out[r.kind] = (out[r.kind] ?? 0) + 1;
    const f = (r.fields ?? {}) as Record<string, string>;
    const key = r.kind === 'interest' ? `interest:${f.program ?? f.context ?? 'site'}` : `request:${f.sport ?? 'any'}`;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

export async function setLeadStatus(brandKey: string, id: number, status: 'new' | 'contacted' | 'closed'): Promise<void> {
  await supabaseAdmin().from('site_leads').update({ status }).eq('brand_key', brandKey).eq('id', id);
}
