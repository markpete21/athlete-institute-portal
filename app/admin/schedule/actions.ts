'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { getPortalSession } from '@/lib/auth';

async function requireStaff() {
  const session = await getPortalSession();
  if (!session.isStaff) throw new Error('Staff only.');
  return session;
}

/**
 * Save the current filter state as a named view. Two submit buttons post the
 * same form: scope="me" keeps it personal, scope="all" shares it with every
 * staff member. Same name re-saves (upsert per creator).
 */
export async function saveViewAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) throw new Error('View name required.');
  const shared = String(formData.get('scope')) === 'all';
  const facilityIds = String(formData.get('facilities') ?? '')
    .split(',')
    .map((s) => Number(s))
    .filter(Boolean);
  const filters = {
    location: String(formData.get('location') ?? '') || null,
    source: String(formData.get('source') ?? '') || null,
    status: String(formData.get('status') ?? '') || null,
    internal: String(formData.get('internal') ?? '') || null,
  };
  const { error } = await supabaseAdmin()
    .from('saved_schedule_views')
    .upsert(
      { name, facility_ids: facilityIds, filters, shared, created_by: session.userId! },
      { onConflict: 'created_by,name' },
    );
  if (error) throw new Error(`save view failed: ${error.message}`);
  revalidatePath('/schedule');
}

/** Owners delete their own views; shared views can be removed by any staff. */
export async function deleteViewAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('viewId'));
  const db = supabaseAdmin();
  const { data: row, error: e0 } = await db
    .from('saved_schedule_views')
    .select('id, shared, created_by')
    .eq('id', id)
    .single();
  if (e0) throw new Error(`view read failed: ${e0.message}`);
  if (!row.shared && row.created_by !== session.userId) {
    throw new Error('Only the owner can delete a personal view.');
  }
  const { error } = await db.from('saved_schedule_views').delete().eq('id', id);
  if (error) throw new Error(`delete view failed: ${error.message}`);
  revalidatePath('/schedule');
}
