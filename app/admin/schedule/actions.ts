'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { getPortalSession } from '@/lib/auth';

async function requireStaff() {
  const session = await getPortalSession();
  if (!session.isStaff) throw new Error('Staff only.');
  return session;
}

export async function saveViewAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) throw new Error('View name required.');
  const facilityIds = String(formData.get('facilities') ?? '')
    .split(',')
    .map((s) => Number(s))
    .filter(Boolean);
  const filters = {
    source: String(formData.get('source') ?? '') || null,
    status: String(formData.get('status') ?? '') || null,
    internal: String(formData.get('internal') ?? '') || null,
  };
  const { error } = await supabaseAdmin()
    .from('saved_schedule_views')
    .upsert(
      { name, facility_ids: facilityIds, filters, created_by: session.userId! },
      { onConflict: 'created_by,name' },
    );
  if (error) throw new Error(`save view failed: ${error.message}`);
  revalidatePath('/schedule');
}

export async function deleteViewAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('viewId'));
  const { error } = await supabaseAdmin()
    .from('saved_schedule_views')
    .delete()
    .eq('id', id)
    .eq('created_by', session.userId!);
  if (error) throw new Error(`delete view failed: ${error.message}`);
  revalidatePath('/schedule');
}
