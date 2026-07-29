'use server';

import { revalidatePath } from 'next/cache';
import { getPortalSession } from '@/lib/auth';
import type { ModuleKey } from '@/lib/nav/modules';
import { setRailMinimized, toggleFavourite, togglePinnedProgram } from '@/lib/nav/prefs';

/** AdminShell preference mutations. Staff-only; scoped to the caller's profile. */
async function requireStaffProfile(): Promise<number> {
  const s = await getPortalSession();
  if (!s.isStaff || !s.profileId) throw new Error('Staff only.');
  return s.profileId;
}

export async function toggleFavouriteAction(key: ModuleKey): Promise<void> {
  const profileId = await requireStaffProfile();
  await toggleFavourite(profileId, key);
  revalidatePath('/', 'layout');
}

export async function togglePinnedProgramAction(programId: number): Promise<void> {
  const profileId = await requireStaffProfile();
  await togglePinnedProgram(profileId, programId);
  revalidatePath('/', 'layout');
}

export async function setRailMinimizedAction(minimized: boolean): Promise<void> {
  const profileId = await requireStaffProfile();
  await setRailMinimized(profileId, minimized);
  revalidatePath('/', 'layout');
}
