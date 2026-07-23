'use server';

import { revalidatePath } from 'next/cache';
import { getPortalSession } from '@/lib/auth';
import { setPublicOpen, upsertAddon, upsertRate } from '@/lib/rentals/rates';

async function requireStaff() {
  const session = await getPortalSession();
  if (!session.isStaff) throw new Error('Staff only.');
  return session;
}

const centsOf = (v: FormDataEntryValue | null): number | null => {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const n = Math.round(Number(s) * 100);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid dollar amount: ${s}`);
  return n;
};

export async function saveRateAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  await upsertRate(
    {
      facility_id: Number(formData.get('facilityId')),
      hourly_cents: centsOf(formData.get('hourly')),
      full_day_cents: centsOf(formData.get('fullDay')),
      flat_cents: centsOf(formData.get('flat')),
    },
    session.userId!,
  );
  revalidatePath('/rentals/settings');
}

export async function saveAddonAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) throw new Error('Add-on name required.');
  await upsertAddon(
    {
      name,
      description: String(formData.get('description') ?? '').trim() || null,
      pricing_mode: String(formData.get('pricingMode') ?? 'flat') as 'flat' | 'per_unit' | 'per_hour',
      default_price_cents: centsOf(formData.get('price')) ?? 0,
      active: formData.get('active') === 'on',
    },
    session.userId!,
  );
  revalidatePath('/rentals/settings');
}

export async function savePublicOpenAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  await setPublicOpen(
    Number(formData.get('facilityId')),
    formData.get('publicOpen') === 'on',
    null, // weekly windows arrive with the self-serve booking page
    session.userId!,
  );
  revalidatePath('/rentals/settings');
}
