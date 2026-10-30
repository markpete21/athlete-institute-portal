'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireSiteRole, canPublish, canManage, inviteMember, changeMemberRole, removeMember, resendInvite } from '@/lib/site/scopes';
import { getPortalSession } from '@/lib/auth';
import { createSite, getSite, setSiteStatus, updateSiteSettings, verifyDns, type SiteStatus } from '@/lib/site/sites';
import { createPage, deletePage, publishPage, saveDraft, unpublishPage, updatePageMeta } from '@/lib/site/pages';
import { addNavItem, deleteNavItem, moveNavItem, updateNavItem, type NavInput } from '@/lib/site/nav';
import { deletePost, savePost, unpublishPost } from '@/lib/site/posts';
import { deleteMedia, updateMedia, uploadMedia } from '@/lib/site/media';
import { addRedirect, deleteRedirect, savePageSeo, setRedirectTarget } from '@/lib/site/seo';
import { deleteProgram, saveLocation, saveProgram, type SiteLocation, type SiteProgram } from '@/lib/site/records';
import { setLeadStatus } from '@/lib/site/leads';
import { addAiQuestion, removeAiQuestion, runAiChecks } from '@/lib/site/analytics';
import { describeImage, draftStory, proposePage, suggestKeywords, writeBlock, writeSeo } from '@/lib/site/claude';
import { mintPreviewToken } from '@/lib/site/preview';
import { siteOrigin } from '@/lib/site/sites';
import type { Block } from '@/lib/site/blocks';

/**
 * Every Websites action (Module 23 §2). Each one re-checks the caller's role on
 * the brand it touches, so a URL or a stale tab can never do more than the
 * scope allows: writers draft, editors publish, admins manage members and the
 * launch switch, super admins create sites.
 */
const num = (v: FormDataEntryValue | null) => (v == null || v === '' ? null : Number(v));
const str = (v: FormDataEntryValue | null) => (v == null ? '' : String(v)).trim();
const bool = (v: FormDataEntryValue | null) => v === 'on' || v === 'true' || v === '1';
const revalidateSite = (brand: string) => { revalidatePath(`/sites/${brand}`, 'layout'); revalidatePath('/sites'); };

// --- Sites -----------------------------------------------------------------

export async function createSiteAction(fd: FormData): Promise<void> {
  const s = await getPortalSession();
  if (!s.isStaff || !s.roles.includes('Admin')) throw new Error('Only a super admin can add a site.');
  const brandKey = str(fd.get('brandKey'));
  await createSite({ brandKey, name: str(fd.get('name')) || brandKey, themeKey: str(fd.get('themeKey')) || 'vanguard', actorClerkId: s.userId! });
  revalidatePath('/sites');
  redirect(`/sites/${brandKey}`);
}

export async function setStatusAction(fd: FormData): Promise<{ ok: boolean; blockers: string[] }> {
  const brand = str(fd.get('brand'));
  const { session } = await requireSiteRole(brand, ['super', 'admin']);
  const result = await setSiteStatus(brand, str(fd.get('status')) as SiteStatus, session.userId!);
  revalidateSite(brand);
  return result;
}

export async function saveSettingsAction(fd: FormData): Promise<void> {
  const brand = str(fd.get('brand'));
  const { session } = await requireSiteRole(brand, ['super', 'admin']);
  const section = str(fd.get('section'));
  const actor = session.userId!;
  if (section === 'domains') {
    const hosts = str(fd.get('hostnames')).split(/[\s,]+/).map((h) => h.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean);
    await updateSiteSettings(brand, { hostnames: hosts, primaryHost: str(fd.get('primaryHost')) || hosts[0] || null }, actor);
  } else if (section === 'contact') {
    await updateSiteSettings(brand, { name: str(fd.get('name')) || undefined, contact: { email: str(fd.get('email')), phone: str(fd.get('phone')), address: str(fd.get('address')), legal_name: str(fd.get('legalName')), map_url: str(fd.get('mapUrl')) } }, actor);
  } else if (section === 'links') {
    await updateSiteSettings(brand, {
      links: { play_url: str(fd.get('playUrl')), watch_url: str(fd.get('watchUrl')), tickets_url: str(fd.get('ticketsUrl')), gear_url: str(fd.get('gearUrl')) },
      social: Object.fromEntries(['instagram', 'facebook', 'youtube', 'tiktok', 'x'].map((k) => [k, str(fd.get(k))]).filter(([, v]) => v)),
    }, actor);
  } else if (section === 'ask') {
    await updateSiteSettings(brand, { settings: { ask_enabled: bool(fd.get('askEnabled')), ask_handoff_email: str(fd.get('askEmail')), ask_handoff_phone: str(fd.get('askPhone')) } }, actor);
  } else if (section === 'gate') {
    const pw = str(fd.get('password'));
    if (pw && pw.length < 4) throw new Error('Use a password of at least 4 characters.');
    await updateSiteSettings(brand, { settings: { gate_password: bool(fd.get('clear')) ? null : pw || undefined, gate_message: str(fd.get('message')) } }, actor);
  } else if (section === 'coming_soon') {
    await updateSiteSettings(brand, { comingSoon: { headline: str(fd.get('headline')), body: str(fd.get('body')), show_email_capture: bool(fd.get('capture')) } }, actor);
  } else if (section === 'footer') {
    const cols = JSON.parse(str(fd.get('columns')) || '[]');
    await updateSiteSettings(brand, { footer: { columns: cols, tagline: str(fd.get('tagline')), legal_text: str(fd.get('legalText')), partners: bool(fd.get('partners')) } }, actor);
  } else if (section === 'analytics_ids') {
    const site = await getSite(brand);
    await updateSiteSettings(brand, { seo: { ...site!.seo, gsc: { ...site!.seo.gsc, property: str(fd.get('gscProperty')) } } }, actor);
  }
  revalidateSite(brand);
}

export async function verifyDnsAction(brand: string): Promise<Awaited<ReturnType<typeof verifyDns>>> {
  await requireSiteRole(brand, ['super', 'admin']);
  const site = await getSite(brand);
  return verifyDns(site?.hostnames ?? []);
}

export async function previewUrlAction(brand: string, path = '/'): Promise<string> {
  const { session } = await requireSiteRole(brand);
  const site = await getSite(brand);
  if (!site) throw new Error('Site not found.');
  const token = mintPreviewToken(brand, session.profileId ?? 0);
  const origin = siteOrigin(site);
  return `${origin}${path}${path.includes('?') ? '&' : '?'}preview=${token}`;
}

// --- Pages -----------------------------------------------------------------

export async function createPageAction(fd: FormData): Promise<void> {
  const brand = str(fd.get('brand'));
  const { session } = await requireSiteRole(brand, ['super', 'admin', 'editor']);
  const blocksRaw = str(fd.get('blocks'));
  const page = await createPage({ brandKey: brand, title: str(fd.get('title')), slug: str(fd.get('slug')) || undefined, template: str(fd.get('template')) || 'custom', blocks: blocksRaw ? (JSON.parse(blocksRaw) as Block[]) : undefined, hiddenFromMenu: bool(fd.get('hidden')), actorClerkId: session.userId! });
  revalidateSite(brand);
  redirect(`/sites/${brand}/pages/${page.id}`);
}

export async function saveDraftAction(brand: string, pageId: number, blocks: unknown): Promise<{ issues: { blockId: string; message: string }[]; state: string; updatedAt: string }> {
  const { session } = await requireSiteRole(brand);
  const r = await saveDraft(brand, pageId, blocks, session.userId!);
  revalidateSite(brand);
  return { issues: r.issues, state: r.page.state, updatedAt: r.page.updatedAt };
}

export async function publishPageAction(brand: string, pageId: number, blocks?: unknown): Promise<{ ok: boolean; issues: { blockId: string; message: string }[] }> {
  const { session, role } = await requireSiteRole(brand);
  if (!canPublish(role)) throw new Error('Writers draft; an editor publishes.');
  if (blocks) {
    const r = await saveDraft(brand, pageId, blocks, session.userId!);
    if (r.issues.length) return { ok: false, issues: r.issues };
  }
  await publishPage(brand, pageId, session.userId!);
  revalidateSite(brand);
  return { ok: true, issues: [] };
}

export async function unpublishPageAction(fd: FormData): Promise<void> {
  const brand = str(fd.get('brand'));
  const { session, role } = await requireSiteRole(brand);
  if (!canPublish(role)) throw new Error('Writers draft; an editor publishes.');
  await unpublishPage(brand, Number(fd.get('id')), session.userId!);
  revalidateSite(brand);
}

export async function deletePageAction(fd: FormData): Promise<void> {
  const brand = str(fd.get('brand'));
  const { session } = await requireSiteRole(brand, ['super', 'admin', 'editor']);
  await deletePage(brand, Number(fd.get('id')), session.userId!);
  revalidateSite(brand);
  redirect(`/sites/${brand}/pages`);
}

export async function updatePageMetaAction(brand: string, pageId: number, patch: { title?: string; slug?: string; hiddenFromMenu?: boolean }): Promise<{ redirectFrom?: string }> {
  const { session } = await requireSiteRole(brand, ['super', 'admin', 'editor']);
  const r = await updatePageMeta(brand, pageId, patch, session.userId!);
  revalidateSite(brand);
  return { redirectFrom: r.redirectFrom };
}

export async function savePageSeoAction(brand: string, pageId: number, seo: { title?: string; description?: string; noindex?: boolean }): Promise<void> {
  const { session } = await requireSiteRole(brand, ['super', 'admin', 'editor']);
  await savePageSeo(brand, pageId, seo, session.userId!);
  revalidateSite(brand);
}

// --- Claude helpers ----------------------------------------------------------

export async function writeBlockAction(brand: string, input: { prompt: string; sourceKeys: string[]; length: string; pageTitle: string }) {
  const { session } = await requireSiteRole(brand);
  const site = await getSite(brand);
  if (!site) throw new Error('Site not found.');
  return writeBlock(site, { ...input, actorClerkId: session.userId! });
}

export async function proposePageAction(brand: string, description: string) {
  const { session } = await requireSiteRole(brand, ['super', 'admin', 'editor']);
  const site = await getSite(brand);
  if (!site) throw new Error('Site not found.');
  return proposePage(site, description, session.userId!);
}

export async function writeSeoAction(brand: string, input: { pageTitle: string; pageText: string; keywords: string[] }) {
  const { session } = await requireSiteRole(brand, ['super', 'admin', 'editor']);
  const site = await getSite(brand);
  if (!site) throw new Error('Site not found.');
  return writeSeo(site, { ...input, actorClerkId: session.userId! });
}

export async function draftStoryAction(brand: string, input: { topic: string; locationSlug?: string; programSlug?: string }) {
  const { session } = await requireSiteRole(brand);
  const site = await getSite(brand);
  if (!site) throw new Error('Site not found.');
  return draftStory(site, { ...input, actorClerkId: session.userId! });
}

export async function describeImageAction(brand: string, mediaId: number, url: string, name: string): Promise<string> {
  const { session } = await requireSiteRole(brand);
  const site = await getSite(brand);
  if (!site) throw new Error('Site not found.');
  const alt = await describeImage(site, url, name, session.userId!);
  await updateMedia(brand, mediaId, { alt }, session.userId!);
  revalidateSite(brand);
  return alt;
}

export async function suggestKeywordsAction(brand: string, seeds: string[]): Promise<string[]> {
  await requireSiteRole(brand, ['super', 'admin', 'editor']);
  const site = await getSite(brand);
  if (!site) throw new Error('Site not found.');
  return suggestKeywords(site, seeds);
}

// --- Navigation --------------------------------------------------------------

export async function addNavAction(brand: string, input: NavInput): Promise<void> {
  const { session } = await requireSiteRole(brand, ['super', 'admin', 'editor']);
  await addNavItem(brand, input, session.userId!);
  revalidateSite(brand);
}

export async function updateNavAction(brand: string, id: number, patch: Partial<NavInput>): Promise<void> {
  const { session } = await requireSiteRole(brand, ['super', 'admin', 'editor']);
  await updateNavItem(brand, id, patch, session.userId!);
  revalidateSite(brand);
}

export async function moveNavAction(brand: string, id: number, target: { id: number; position: 'before' | 'after' | 'in' } | { parentId: number | null; index: number }): Promise<{ ok: true } | { ok: false; error: string }> {
  const { session } = await requireSiteRole(brand, ['super', 'admin', 'editor']);
  try {
    await moveNavItem(brand, id, target, session.userId!);
    revalidateSite(brand);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not move that item.' };
  }
}

export async function deleteNavAction(brand: string, id: number): Promise<void> {
  const { session } = await requireSiteRole(brand, ['super', 'admin', 'editor']);
  await deleteNavItem(brand, id, session.userId!);
  revalidateSite(brand);
}

// --- Stories -----------------------------------------------------------------

export async function savePostAction(brand: string, input: Parameters<typeof savePost>[1], mode: 'draft' | 'publish' | 'schedule', scheduleAt: string | null): Promise<{ id: number; status: string; slug: string }> {
  const { session, role } = await requireSiteRole(brand);
  if (mode !== 'draft' && !canPublish(role)) throw new Error('Writers draft; an editor publishes.');
  const post = await savePost(brand, input, mode, scheduleAt, session.userId!);
  revalidateSite(brand);
  return { id: post.id, status: post.status, slug: post.slug };
}

export async function unpublishPostAction(fd: FormData): Promise<void> {
  const brand = str(fd.get('brand'));
  const { session, role } = await requireSiteRole(brand);
  if (!canPublish(role)) throw new Error('Writers draft; an editor publishes.');
  await unpublishPost(brand, Number(fd.get('id')), session.userId!);
  revalidateSite(brand);
}

export async function deletePostAction(fd: FormData): Promise<void> {
  const brand = str(fd.get('brand'));
  const { session } = await requireSiteRole(brand, ['super', 'admin', 'editor']);
  await deletePost(brand, Number(fd.get('id')), session.userId!);
  revalidateSite(brand);
  redirect(`/sites/${brand}/stories`);
}

// --- Media -------------------------------------------------------------------

export async function uploadMediaAction(fd: FormData): Promise<{ ok: boolean; errors: string[] }> {
  const brand = str(fd.get('brand'));
  const { session } = await requireSiteRole(brand);
  const folder = str(fd.get('folder')) || 'Uploads';
  const replaceId = num(fd.get('replaceId'));
  const errors: string[] = [];
  for (const f of fd.getAll('files')) {
    if (!(f instanceof File) || f.size === 0) continue;
    try { await uploadMedia(brand, f, folder, session.userId!, replaceId ?? undefined); } catch (e) { errors.push(e instanceof Error ? e.message : `${f.name} wasn't added.`); }
  }
  revalidateSite(brand);
  return { ok: errors.length === 0, errors };
}

export async function updateMediaAction(fd: FormData): Promise<void> {
  const brand = str(fd.get('brand'));
  const { session } = await requireSiteRole(brand);
  await updateMedia(brand, Number(fd.get('id')), { alt: str(fd.get('alt')), decorative: bool(fd.get('decorative')), credit: str(fd.get('credit')), folder: str(fd.get('folder')) || undefined }, session.userId!);
  revalidateSite(brand);
}

export async function deleteMediaAction(fd: FormData): Promise<void> {
  const brand = str(fd.get('brand'));
  const { session } = await requireSiteRole(brand, ['super', 'admin', 'editor']);
  await deleteMedia(brand, Number(fd.get('id')), session.userId!);
  revalidateSite(brand);
}

// --- SEO ---------------------------------------------------------------------

export async function saveSeoWizardAction(fd: FormData): Promise<void> {
  const brand = str(fd.get('brand'));
  const { session } = await requireSiteRole(brand, ['super', 'admin', 'editor']);
  const site = await getSite(brand);
  if (!site) throw new Error('Site not found.');
  const keywords = str(fd.get('keywords')).split(/\n|,/).map((k) => k.trim()).filter(Boolean).slice(0, 12);
  await updateSiteSettings(brand, {
    seo: {
      ...site.seo,
      title: str(fd.get('title')),
      default_description: str(fd.get('description')),
      og_image_url: str(fd.get('ogImage')),
      keywords,
      business: { name: str(fd.get('bizName')), offer: str(fd.get('bizOffer')), location_slugs: fd.getAll('bizLocations').map(String) },
      title_formats: { page: str(fd.get('fmtPage')) || site.seo.title_formats?.page, location: str(fd.get('fmtLocation')) || site.seo.title_formats?.location, sport: str(fd.get('fmtSport')) || site.seo.title_formats?.sport, team: str(fd.get('fmtTeam')) || site.seo.title_formats?.team },
      index_team_pages: bool(fd.get('indexTeams')),
      ai: { answers: bool(fd.get('aiAnswers')), training: bool(fd.get('aiTraining')) },
      setup_done: true,
    },
  }, session.userId!);
  revalidateSite(brand);
}

export async function markGscAction(fd: FormData): Promise<void> {
  const brand = str(fd.get('brand'));
  const { session } = await requireSiteRole(brand, ['super', 'admin', 'editor']);
  const site = await getSite(brand);
  if (!site) throw new Error('Site not found.');
  const key = str(fd.get('key')) as 'verified_at' | 'sitemap_submitted_at';
  await updateSiteSettings(brand, { seo: { ...site.seo, gsc: { ...site.seo.gsc, [key]: bool(fd.get('done')) ? new Date().toISOString() : null } } }, session.userId!);
  revalidateSite(brand);
}

export async function addRedirectAction(fd: FormData): Promise<void> {
  const brand = str(fd.get('brand'));
  const { session } = await requireSiteRole(brand, ['super', 'admin', 'editor']);
  const to = str(fd.get('to'));
  await addRedirect(brand, str(fd.get('from')), to || null, str(fd.get('reason')) || 'manual', session.userId!);
  revalidateSite(brand);
}

export async function setRedirectAction(fd: FormData): Promise<void> {
  const brand = str(fd.get('brand'));
  const { session } = await requireSiteRole(brand, ['super', 'admin', 'editor']);
  const to = str(fd.get('to'));
  await setRedirectTarget(brand, Number(fd.get('id')), to || null, session.userId!);
  revalidateSite(brand);
}

export async function deleteRedirectAction(fd: FormData): Promise<void> {
  const brand = str(fd.get('brand'));
  const { session } = await requireSiteRole(brand, ['super', 'admin', 'editor']);
  await deleteRedirect(brand, Number(fd.get('id')), session.userId!);
  revalidateSite(brand);
}

// --- Records (locations, programs) ---------------------------------------------

export async function saveLocationAction(fd: FormData): Promise<void> {
  const brand = str(fd.get('brand'));
  const { session } = await requireSiteRole(brand, ['super', 'admin', 'editor']);
  const calendar = str(fd.get('calendar')).split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((p) => p[0]).map((p) => [p[0], p[1] ?? ''] as [string, string]);
  const input: Partial<SiteLocation> & { name: string } = {
    id: num(fd.get('id')) ?? undefined, slug: str(fd.get('slug')) || undefined, name: str(fd.get('name')), city: str(fd.get('city')), region: str(fd.get('region')) || 'Ontario',
    venue: str(fd.get('venue')), address: str(fd.get('address')), parking: str(fd.get('parking')), arrival: str(fd.get('arrival')), contact: str(fd.get('contact')), socialUrl: str(fd.get('socialUrl')),
    status: (str(fd.get('status')) || 'opening_soon') as SiteLocation['status'], launchLabel: str(fd.get('launchLabel')), sports: fd.getAll('sports').map(String), note: str(fd.get('note')),
    photoUrl: str(fd.get('photoUrl')), photoAlt: str(fd.get('photoAlt')), calendar, sortOrder: num(fd.get('sortOrder')) ?? 100,
  };
  await saveLocation(brand, input, session.userId!);
  revalidateSite(brand);
}

export async function saveProgramAction(fd: FormData): Promise<void> {
  const brand = str(fd.get('brand'));
  const { session } = await requireSiteRole(brand, ['super', 'admin', 'editor']);
  const facts = str(fd.get('facts')).split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((p) => p[0]).map((p) => [p[0], p[1] ?? '[TBC]'] as [string, string]);
  const input: Partial<SiteProgram> & { name: string; locationSlug: string; sport: string; leagueType: string } = {
    id: num(fd.get('id')) ?? undefined, slug: str(fd.get('slug')) || undefined, name: str(fd.get('name')), locationSlug: str(fd.get('locationSlug')), sport: str(fd.get('sport')), leagueType: str(fd.get('leagueType')) || 'league',
    status: (str(fd.get('status')) || 'coming_soon') as SiteProgram['status'], statusLabel: str(fd.get('statusLabel')), description: str(fd.get('description')), facts, programId: num(fd.get('programId')), sortOrder: num(fd.get('sortOrder')) ?? 100,
  };
  await saveProgram(brand, input, session.userId!);
  revalidateSite(brand);
}

export async function deleteProgramAction(fd: FormData): Promise<void> {
  const brand = str(fd.get('brand'));
  const { session } = await requireSiteRole(brand, ['super', 'admin', 'editor']);
  await deleteProgram(brand, Number(fd.get('id')), session.userId!);
  revalidateSite(brand);
}

// --- Leads -------------------------------------------------------------------

export async function setLeadStatusAction(fd: FormData): Promise<void> {
  const brand = str(fd.get('brand'));
  await requireSiteRole(brand, ['super', 'admin', 'editor']);
  await setLeadStatus(brand, Number(fd.get('id')), str(fd.get('status')) as 'new' | 'contacted' | 'closed');
  revalidateSite(brand);
}

// --- Analytics (AI questions) --------------------------------------------------

export async function addAiQuestionAction(fd: FormData): Promise<void> {
  const brand = str(fd.get('brand'));
  const { session } = await requireSiteRole(brand, ['super', 'admin', 'editor']);
  await addAiQuestion(brand, str(fd.get('question')), session.userId!);
  revalidateSite(brand);
}

export async function removeAiQuestionAction(fd: FormData): Promise<void> {
  const brand = str(fd.get('brand'));
  await requireSiteRole(brand, ['super', 'admin', 'editor']);
  await removeAiQuestion(brand, Number(fd.get('id')));
  revalidateSite(brand);
}

export async function runAiChecksAction(fd: FormData): Promise<void> {
  const brand = str(fd.get('brand'));
  await requireSiteRole(brand, ['super', 'admin']);
  const site = await getSite(brand);
  if (!site) throw new Error('Site not found.');
  await runAiChecks(brand, siteOrigin(site), site.name);
  revalidateSite(brand);
}

// --- Members -----------------------------------------------------------------

export async function inviteMemberAction(fd: FormData): Promise<void> {
  const brand = str(fd.get('brand'));
  const { session, role } = await requireSiteRole(brand, ['super', 'admin']);
  if (!canManage(role)) throw new Error('Admins manage members.');
  await inviteMember(brand, str(fd.get('email')), str(fd.get('role')) as 'admin' | 'editor' | 'writer', session.userId!);
  revalidateSite(brand);
}

export async function changeRoleAction(fd: FormData): Promise<void> {
  const brand = str(fd.get('brand'));
  const { session } = await requireSiteRole(brand, ['super', 'admin']);
  await changeMemberRole(brand, Number(fd.get('id')), str(fd.get('role')) as 'admin' | 'editor' | 'writer', session.userId!);
  revalidateSite(brand);
}

export async function removeMemberAction(fd: FormData): Promise<void> {
  const brand = str(fd.get('brand'));
  const { session } = await requireSiteRole(brand, ['super', 'admin']);
  await removeMember(brand, Number(fd.get('id')), session.userId!);
  revalidateSite(brand);
}

export async function resendInviteAction(fd: FormData): Promise<void> {
  const brand = str(fd.get('brand'));
  await requireSiteRole(brand, ['super', 'admin']);
  await resendInvite(brand, Number(fd.get('id')));
  revalidateSite(brand);
}
