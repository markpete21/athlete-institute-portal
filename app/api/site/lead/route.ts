import { NextRequest, NextResponse } from 'next/server';
import { createLead, type LeadKind } from '@/lib/site/leads';

export const dynamic = 'force-dynamic';

const KINDS: LeadKind[] = ['interest', 'request', 'host', 'contact', 'assistance'];

/** Public lead capture (interest, request a location, host a league, contact, assistance). CASL consent required. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  const ct = req.headers.get('content-type') ?? '';
  try {
    if (ct.includes('application/json')) body = await req.json();
    else { const fd = await req.formData(); fd.forEach((v, k) => { body[k] = typeof v === 'string' ? v : ''; }); }
  } catch { /* fallthrough */ }
  const brandKey = String(body.brandKey ?? '').trim();
  const kind = String(body.kind ?? 'interest') as LeadKind;
  if (!brandKey || !KINDS.includes(kind)) return NextResponse.json({ ok: false, error: 'Bad request.' }, { status: 400 });
  let fields: Record<string, string> = {};
  if (body.fields && typeof body.fields === 'object') fields = Object.fromEntries(Object.entries(body.fields as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '').slice(0, 2000)]));
  const result = await createLead(brandKey, {
    kind,
    email: String(body.email ?? ''),
    name: body.name ? String(body.name).slice(0, 200) : undefined,
    phone: body.phone ? String(body.phone).slice(0, 40) : undefined,
    fields,
    consent: body.consent === true || body.consent === 'on' || body.consent === 'true',
    consentText: String(body.consentText ?? '').slice(0, 1000),
    sourcePath: body.sourcePath ? String(body.sourcePath).slice(0, 300) : undefined,
  });
  if (!ct.includes('application/json')) {
    const back = new URL(req.headers.get('referer') ?? '/', req.url);
    back.searchParams.set(result.ok ? 'sent' : 'error', result.ok ? '1' : result.error);
    return NextResponse.redirect(back, 303);
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
