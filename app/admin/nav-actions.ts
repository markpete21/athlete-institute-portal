'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import type { ModuleKey } from '@/lib/nav/modules';
import { setRailMinimized, toggleFavourite, togglePinnedProgram } from '@/lib/nav/prefs';

/** AdminShell preference mutations. Staff-only; scoped to the caller's profile. */
export async function toggleFavouriteAction(key: ModuleKey): Promise<void> {
  const { profileId } = await requireStaff();
  await toggleFavourite(profileId, key);
  revalidatePath('/', 'layout');
}

export async function togglePinnedProgramAction(programId: number): Promise<void> {
  const { profileId } = await requireStaff();
  await togglePinnedProgram(profileId, programId);
  revalidatePath('/', 'layout');
}

export async function setRailMinimizedAction(minimized: boolean): Promise<void> {
  const { profileId } = await requireStaff();
  await setRailMinimized(profileId, minimized);
  revalidatePath('/', 'layout');
}
