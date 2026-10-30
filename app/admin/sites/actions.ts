'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getPortalSession } from '@/lib/auth';
import { createSite, getSite, siteOrigin } from '@/lib/site/sites';
import { siteRoleFor } from '@/lib/site/scopes';
import { mintHandoffToken } from '@/lib/site/editor-session';

/** Portal Admin › Websites: the list of sites, creating one, and the hand-off into a site's own editor. */
export async function createSiteAction(fd: FormData): Promise<void> {
  const s = await getPortalSession();
  if (!s.isStaff || !s.roles.includes('Admin')) throw new Error('Only a super admin can add a site.');
  const brandKey = String(fd.get('brandKey') ?? '').trim();
  await createSite({ brandKey, name: String(fd.get('name') ?? '').trim() || brandKey, themeKey: String(fd.get('themeKey') ?? '').trim() || 'vanguard', actorClerkId: s.userId! });
  revalidatePath('/sites');
}

/**
 * Open editor: mint a 5-minute hand-off token for the signed-in person and
 * send them to <site>/admin/auth, which swaps it for the editor cookie on the
 * brand host. Works before (and after) the host is a Clerk satellite.
 */
export async function openEditorAction(fd: FormData): Promise<void> {
  const brandKey = String(fd.get('brand') ?? '').trim();
  const s = await getPortalSession();
  const role = await siteRoleFor(s, brandKey);
  if (!role || !s.profileId) throw new Error('You don\'t have access to this site.');
  const site = await getSite(brandKey);
  if (!site?.primaryHost) throw new Error('Add a domain to the site first (Settings › Domains).');
  const token = mintHandoffToken(brandKey, s.profileId);
  redirect(`${siteOrigin(site)}/admin/auth?token=${encodeURIComponent(token)}`);
}
