'use server';

import { revalidatePath } from 'next/cache';
import { getPortalSession } from '@/lib/auth';
import { createSeason, setSeasonArchived, updateSeason } from '@/lib/seasons/seasons';

async function requireStaff() {
  const session = await getPortalSession();
  if (!session.isStaff) throw new Error('Staff only.');
  return session;
}

const dateOrNull = (v: FormDataEntryValue | null) => {
  const s = String(v ?? '').trim();
  return s || null;
};

export async function createSeasonAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const name = String(formData.get('name') ?? '').trim();
  // Key defaults from the name ("Winter 2027" -> "winter-2027") so staff never
  // have to think about it; the canonical thirds-of-year keys stay supported.
  const key = String(formData.get('key') ?? '').trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!name || !key) throw new Error('Name is required.');
  await createSeason(
    { key, name, startsOn: dateOrNull(formData.get('startsOn')), endsOn: dateOrNull(formData.get('endsOn')) },
    session.userId!,
  );
  revalidatePath('/seasons');
}

export async function updateSeasonAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  await updateSeason(
    Number(formData.get('id')),
    {
      name: String(formData.get('name') ?? '').trim(),
      startsOn: dateOrNull(formData.get('startsOn')),
      endsOn: dateOrNull(formData.get('endsOn')),
    },
    session.userId!,
  );
  revalidatePath('/seasons');
}

export async function setSeasonArchivedAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  await setSeasonArchived(Number(formData.get('id')), formData.get('archived') === 'true', session.userId!);
  revalidatePath('/seasons');
}
