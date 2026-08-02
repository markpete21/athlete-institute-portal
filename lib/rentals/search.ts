import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Lookup across quotes, rentals and invoices (Module 3 review).
 *
 * The rentals screen used to be "the newest 50, no filters", which is fine
 * until there are more than 50 - after that a rental from last season is
 * simply unreachable. Everything here is server-side so the finder works on
 * the whole table, not on a page of it.
 *
 * One rental IS the quote and the agreement: status walks
 * quote -> deposit_due -> balance_due -> paid, so "find a quote" and "find a
 * rental" are the same query with a different status filter. Invoices are the
 * instalments hanging off it.
 */

export type RentalStatusFilter =
  | 'quote' | 'deposit_due' | 'balance_due' | 'overdue' | 'paid' | 'cancelled';

export interface RentalSearchFilters {
  /** Free text: title, contact name/email/phone, organization, or #id. */
  q?: string;
  status?: RentalStatusFilter | '';
  /** 'internal' | 'external' | '' */
  kind?: string;
  bookingType?: string;
  /** Toronto dates against rentals.created_at. */
  createdFrom?: string;
  createdTo?: string;
  /** Only rentals with money still owed. */
  outstandingOnly?: boolean;
  limit?: number;
}

export interface RentalSearchRow {
  id: number;
  title: string;
  status: string;
  is_internal: boolean;
  booking_type: string | null;
  contact_name: string | null;
  contact_email: string | null;
  organization_name: string | null;
  total_cents: number;
  /** Sum of unpaid, unwaived instalments. 0 for a fully paid or $0 rental. */
  outstanding_cents: number;
  /** Earliest unpaid instalment date, if any. */
  next_due: string | null;
  /** True when an unpaid instalment is already past its due date. */
  past_due: boolean;
  created_at: string;
  /** First and last booked block, for "when is this actually happening". */
  first_block: string | null;
  last_block: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Escape PostgREST `or=` reserved characters in user-supplied text. */
function safeLike(raw: string): string {
  return raw.replace(/[(),*"\\]/g, ' ').trim();
}

export async function searchRentals(f: RentalSearchFilters): Promise<RentalSearchRow[]> {
  const db = supabaseAdmin();
  const limit = Math.min(f.limit ?? 100, 500);

  let q = db
    .from('rentals')
    .select(
      'id, title, status, is_internal, booking_type, contact_name, contact_email, organization_id, total_cents, created_at',
    )
    .order('id', { ascending: false })
    .limit(limit);

  if (f.status) q = q.eq('status', f.status);
  if (f.kind === 'internal') q = q.eq('is_internal', true);
  if (f.kind === 'external') q = q.eq('is_internal', false);
  if (f.bookingType) q = q.eq('booking_type', f.bookingType);
  if (f.createdFrom && DATE.test(f.createdFrom)) q = q.gte('created_at', `${f.createdFrom}T00:00:00-05:00`);
  if (f.createdTo && DATE.test(f.createdTo)) q = q.lte('created_at', `${f.createdTo}T23:59:59-04:00`);

  const text = safeLike(f.q ?? '');
  if (text) {
    // "#412" or a bare number searches by id; anything else is a text match.
    const asId = Number(text.replace(/^#/, ''));
    if (Number.isInteger(asId) && asId > 0 && /^#?\d+$/.test(text)) {
      q = q.eq('id', asId);
    } else {
      q = q.or(
        [
          `title.ilike.%${text}%`,
          `contact_name.ilike.%${text}%`,
          `contact_email.ilike.%${text}%`,
          `contact_phone.ilike.%${text}%`,
          `notes.ilike.%${text}%`,
        ].join(','),
      );
    }
  }

  const { data, error } = await q;
  if (error) throw new Error(`rental search failed: ${error.message}`);
  let rows = (data ?? []) as Array<Record<string, unknown>>;

  // Organization is a separate table; a text search should still find
  // "Headwaters" when that's the org rather than the contact. Done as a second
  // pass so the main query stays a single indexed scan.
  const orgIds = [...new Set(rows.map((r) => r.organization_id as number | null).filter(Boolean))] as number[];
  const orgNames = new Map<number, string>();
  if (orgIds.length) {
    const { data: orgs } = await db.from('organizations').select('id, name').in('id', orgIds);
    for (const o of orgs ?? []) orgNames.set(o.id as number, o.name as string);
  }

  if (text && !/^#?\d+$/.test(text)) {
    const { data: matchOrgs } = await db.from('organizations').select('id').ilike('name', `%${text}%`);
    const matchIds = new Set((matchOrgs ?? []).map((o) => o.id as number));
    if (matchIds.size) {
      let orgQuery = db
        .from('rentals')
        .select(
          'id, title, status, is_internal, booking_type, contact_name, contact_email, organization_id, total_cents, created_at',
        )
        .in('organization_id', [...matchIds])
        .order('id', { ascending: false })
        .limit(limit);
      if (f.status) orgQuery = orgQuery.eq('status', f.status);
      if (f.kind === 'internal') orgQuery = orgQuery.eq('is_internal', true);
      if (f.kind === 'external') orgQuery = orgQuery.eq('is_internal', false);
      const { data: byOrg } = await orgQuery;
      const seen = new Set(rows.map((r) => r.id as number));
      for (const r of byOrg ?? []) {
        if (!seen.has(r.id as number)) rows.push(r as Record<string, unknown>);
      }
      rows.sort((a, b) => (b.id as number) - (a.id as number));
      const missing = [...new Set(rows.map((r) => r.organization_id as number | null).filter(Boolean))] as number[];
      const unresolved = missing.filter((id) => !orgNames.has(id));
      if (unresolved.length) {
        const { data: more } = await db.from('organizations').select('id, name').in('id', unresolved);
        for (const o of more ?? []) orgNames.set(o.id as number, o.name as string);
      }
    }
  }

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id as number);

  // Outstanding / next due / past due, and the booked date range, in two
  // batched queries rather than one per row.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
  const [{ data: insts }, { data: lines }] = await Promise.all([
    db.from('rental_installments').select('rental_id, amount_cents, due_date, status').in('rental_id', ids),
    db.from('rental_lines').select('rental_id, starts_at, ends_at').in('rental_id', ids),
  ]);

  const owed = new Map<number, { cents: number; next: string | null; past: boolean }>();
  for (const i of insts ?? []) {
    const rid = i.rental_id as number;
    const status = i.status as string;
    if (status === 'paid' || status === 'waived') continue;
    const cur = owed.get(rid) ?? { cents: 0, next: null as string | null, past: false };
    cur.cents += i.amount_cents as number;
    const due = i.due_date as string;
    if (!cur.next || due < cur.next) cur.next = due;
    if (due < today) cur.past = true;
    owed.set(rid, cur);
  }

  const span = new Map<number, { first: string; last: string }>();
  for (const l of lines ?? []) {
    const rid = l.rental_id as number;
    const cur = span.get(rid);
    const s = l.starts_at as string;
    const e = l.ends_at as string;
    if (!cur) span.set(rid, { first: s, last: e });
    else {
      if (s < cur.first) cur.first = s;
      if (e > cur.last) cur.last = e;
    }
  }

  let out: RentalSearchRow[] = rows.map((r) => {
    const id = r.id as number;
    const o = owed.get(id);
    const sp = span.get(id);
    return {
      id,
      title: r.title as string,
      status: r.status as string,
      is_internal: r.is_internal as boolean,
      booking_type: (r.booking_type as string) ?? null,
      contact_name: (r.contact_name as string) ?? null,
      contact_email: (r.contact_email as string) ?? null,
      organization_name: orgNames.get(r.organization_id as number) ?? null,
      total_cents: r.total_cents as number,
      outstanding_cents: o?.cents ?? 0,
      next_due: o?.next ?? null,
      past_due: o?.past ?? false,
      created_at: r.created_at as string,
      first_block: sp?.first ?? null,
      last_block: sp?.last ?? null,
    };
  });

  if (f.outstandingOnly) out = out.filter((r) => r.outstanding_cents > 0);
  return out;
}

// ---------------------------------------------------------------------------
// Invoices = instalments. This is the accounts-receivable view.
// ---------------------------------------------------------------------------

export interface InvoiceSearchFilters {
  q?: string;
  /** 'pending' | 'paid' | 'failed' | 'waived' | 'overdue' (derived) | '' */
  status?: string;
  dueFrom?: string;
  dueTo?: string;
  limit?: number;
}

export interface InvoiceRow {
  id: number;
  rental_id: number;
  rental_title: string;
  contact_name: string | null;
  organization_name: string | null;
  seq: number;
  label: string;
  amount_cents: number;
  due_date: string;
  is_deposit: boolean;
  status: string;
  /** Derived: pending and past its due date. */
  overdue: boolean;
  stripe_invoice_id: string | null;
  paid_at: string | null;
}

export async function searchInvoices(f: InvoiceSearchFilters): Promise<InvoiceRow[]> {
  const db = supabaseAdmin();
  const limit = Math.min(f.limit ?? 200, 1000);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });

  let q = db
    .from('rental_installments')
    .select('id, rental_id, seq, label, amount_cents, due_date, is_deposit, status, stripe_invoice_id, paid_at')
    .order('due_date', { ascending: true })
    .limit(limit);

  // 'overdue' isn't a stored status - it's pending past its date.
  if (f.status === 'overdue') q = q.eq('status', 'pending').lt('due_date', today);
  else if (f.status) q = q.eq('status', f.status);

  if (f.dueFrom && DATE.test(f.dueFrom)) q = q.gte('due_date', f.dueFrom);
  if (f.dueTo && DATE.test(f.dueTo)) q = q.lte('due_date', f.dueTo);

  const { data, error } = await q;
  if (error) throw new Error(`invoice search failed: ${error.message}`);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (rows.length === 0) return [];

  const rentalIds = [...new Set(rows.map((r) => r.rental_id as number))];
  const { data: rentals } = await db
    .from('rentals')
    .select('id, title, contact_name, organization_id')
    .in('id', rentalIds);

  const orgIds = [...new Set((rentals ?? []).map((r) => r.organization_id as number | null).filter(Boolean))] as number[];
  const orgNames = new Map<number, string>();
  if (orgIds.length) {
    const { data: orgs } = await db.from('organizations').select('id, name').in('id', orgIds);
    for (const o of orgs ?? []) orgNames.set(o.id as number, o.name as string);
  }
  const byRental = new Map(
    (rentals ?? []).map((r) => [
      r.id as number,
      {
        title: r.title as string,
        contact: (r.contact_name as string) ?? null,
        org: orgNames.get(r.organization_id as number) ?? null,
      },
    ]),
  );

  const text = safeLike(f.q ?? '').toLowerCase();
  return rows
    .map((r) => {
      const meta = byRental.get(r.rental_id as number);
      const status = r.status as string;
      const due = r.due_date as string;
      return {
        id: r.id as number,
        rental_id: r.rental_id as number,
        rental_title: meta?.title ?? `Rental #${r.rental_id}`,
        contact_name: meta?.contact ?? null,
        organization_name: meta?.org ?? null,
        seq: r.seq as number,
        label: r.label as string,
        amount_cents: r.amount_cents as number,
        due_date: due,
        is_deposit: r.is_deposit as boolean,
        status,
        overdue: status === 'pending' && due < today,
        stripe_invoice_id: (r.stripe_invoice_id as string) ?? null,
        paid_at: (r.paid_at as string) ?? null,
      };
    })
    .filter((r) => {
      if (!text) return true;
      return [r.rental_title, r.contact_name, r.organization_name, r.label, `#${r.rental_id}`]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(text));
    });
}
