import 'server-only';
import {
  torontoToday,
} from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/** Staff unavailability (self-service dates a coach cannot work). */

// --- Unavailability (staff self-service) ------------------------------------

export async function submitUnavailability(staffId: number, dateISO: string, note: string | null): Promise<void> {
  const { error } = await supabaseAdmin().from('staff_unavailability').upsert({ staff_id: staffId, date: dateISO, note }, { onConflict: 'staff_id,date' });
  if (error) throw new Error(error.message);
}

export async function removeUnavailability(staffId: number, dateISO: string): Promise<void> {
  const { error } = await supabaseAdmin().from('staff_unavailability').delete().eq('staff_id', staffId).eq('date', dateISO);
  if (error) throw new Error(error.message);
}

/** Upcoming submitted unavailability, org-wide (admin surfacing - informs manual decisions, never auto-reassigns). */
export async function upcomingUnavailability(): Promise<Array<{ staff_id: number; date: string; note: string | null; name: string }>> {
  const { data } = await supabaseAdmin()
    .from('staff_unavailability')
    .select('staff_id, date, note, staff(first_name, last_name)')
    .gte('date', torontoToday())
    .order('date');
  return (data ?? []).map((r) => {
    const s = r.staff as unknown as { first_name: string; last_name: string };
    return { staff_id: r.staff_id, date: r.date, note: r.note, name: `${s.first_name} ${s.last_name}` };
  });
}
