import 'server-only';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import type { PortalSession } from '@/lib/auth';
import { getSiteSession } from '@/lib/site/editor-session';

/**
 * Who may work on which brand site (Module 23 §2.6, ALL CAN §6.9).
 *   super   every app (the portal's Admin role or an allowlisted super admin)
 *   admin   everything on this site, including members, launch and domains
 *   editor  pages, menu, stories, media, SEO; can publish
 *   writer  drafts stories and uploads media; an editor publishes
 */

export type SiteRole = 'super' | 'admin' | 'editor' | 'writer';

export interface SiteMember {
  id: number;
  profileId: number | null;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'writer';
  status: 'invited' | 'active';
  lastActiveAt: string | null;
  createdAt: string;
}

export interface SiteAccess { session: PortalSession; role: SiteRole }

function isSuper(session: PortalSession): boolean {
  return session.isStaff && (session.roles.includes('Admin') || session.userType === 'staff' && session.roles.length === 0 && !!session.email && (process.env.STAFF_ALLOWLIST_EMAILS ?? '').toLowerCase().includes(session.email.toLowerCase()));
}

/** Role of the signed-in user on a site, or null when they may not open it. */
export async function siteRoleFor(session: PortalSession, brandKey: string): Promise<SiteRole | null> {
  // A site member need not be staff (ALL CAN §6.9): the scope row is the grant.
  if (!session.userId) return null;
  if (isSuper(session)) return 'super';
  if (!session.profileId) return null;
  const { data } = await supabaseAdmin().from('site_editor_scopes').select('role, status').eq('brand_key', brandKey).eq('profile_id', session.profileId).maybeSingle();
  if (!data || data.status !== 'active') return null;
  return data.role as SiteRole;
}

/** Brand keys the signed-in user may open in Websites. */
export async function editableSites(session: PortalSession): Promise<string[]> {
  if (!session.userId) return [];
  const db = supabaseAdmin();
  if (isSuper(session)) return (await db.from('brand_sites').select('brand_key')).data?.map((s) => s.brand_key) ?? [];
  if (!session.profileId) return [];
  const { data } = await db.from('site_editor_scopes').select('brand_key').eq('profile_id', session.profileId).eq('status', 'active');
  return (data ?? []).map((s) => s.brand_key);
}

/** Guard for every admin action: throws unless the role is allowed. */
export async function requireSiteRole(brandKey: string, allowed: SiteRole[] = ['super', 'admin', 'editor', 'writer']): Promise<SiteAccess> {
  const session = await getSiteSession(brandKey);
  const role = await siteRoleFor(session, brandKey);
  if (!role || !allowed.includes(role)) throw new Error('You don\'t have access to this site.');
  if (session.profileId && role !== 'super') {
    await supabaseAdmin().from('site_editor_scopes').update({ last_active_at: new Date().toISOString() }).eq('brand_key', brandKey).eq('profile_id', session.profileId);
  }
  return { session, role };
}

export const canPublish = (role: SiteRole) => role !== 'writer';
export const canManage = (role: SiteRole) => role === 'super' || role === 'admin';

export async function listMembers(brandKey: string): Promise<SiteMember[]> {
  const { data } = await supabaseAdmin().from('site_editor_scopes').select('id, profile_id, invited_email, role, status, last_active_at, created_at, profiles(email, first_name, last_name)').eq('brand_key', brandKey).order('created_at');
  return (data ?? []).map((r) => {
    const p = r.profiles as unknown as { email: string | null; first_name: string | null; last_name: string | null } | null;
    return {
      id: r.id, profileId: r.profile_id ?? null,
      name: [p?.first_name, p?.last_name].filter(Boolean).join(' ') || (r.invited_email ?? p?.email ?? '').split('@')[0],
      email: p?.email ?? r.invited_email ?? '', role: r.role, status: r.status, lastActiveAt: r.last_active_at ?? null, createdAt: r.created_at,
    };
  });
}

/** Super admins (portal Admin role) listed on the Members page, read-only. */
export async function superAdmins(): Promise<{ name: string; email: string }[]> {
  const db = supabaseAdmin();
  const { data } = await db.from('role_assignments').select('profiles(email, first_name, last_name), roles!inner(name)').eq('roles.name', 'Admin');
  const out = (data ?? []).map((r) => { const p = r.profiles as unknown as { email: string | null; first_name: string | null; last_name: string | null } | null; return { name: [p?.first_name, p?.last_name].filter(Boolean).join(' ') || p?.email || '', email: p?.email ?? '' }; });
  for (const e of (process.env.STAFF_ALLOWLIST_EMAILS ?? '').split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)) {
    if (!out.some((o) => o.email.toLowerCase() === e.toLowerCase())) out.push({ name: e.split('@')[0], email: e });
  }
  return out;
}

async function adminCount(brandKey: string): Promise<number> {
  const { count } = await supabaseAdmin().from('site_editor_scopes').select('id', { count: 'exact', head: true }).eq('brand_key', brandKey).eq('role', 'admin').eq('status', 'active');
  return (count ?? 0) + (await superAdmins()).length;
}

export async function inviteMember(brandKey: string, email: string, role: SiteMember['role'], actorClerkId: string): Promise<SiteMember> {
  const db = supabaseAdmin();
  const em = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) throw new Error('Enter a valid email.');
  const { data: profile } = await db.from('profiles').select('id, user_type').eq('email', em).maybeSingle();
  const { data: existing } = await db.from('site_editor_scopes').select('id').eq('brand_key', brandKey).or(profile ? `profile_id.eq.${profile.id},invited_email.eq.${em}` : `invited_email.eq.${em}`).maybeSingle();
  if (existing) throw new Error('That person already has access. Change their role in the table.');
  const row = { brand_key: brandKey, profile_id: profile ? (profile.id as number) : null, invited_email: em, role, status: profile ? 'active' : 'invited', granted_by: actorClerkId };
  const { data, error } = await db.from('site_editor_scopes').insert(row).select('id').single();
  if (error) throw new Error(error.message);
  if (profile) await grantSiteEditorRole(profile.id, actorClerkId);
  await audit({ actorId: actorClerkId, action: 'scope.grant', target: `site:${brandKey}`, meta: { email: em, role, status: row.status } });
  const { notify } = await import('@ai/foundation/notify');
  const { getSite, siteOrigin } = await import('@/lib/site/sites');
  const site = await getSite(brandKey);
  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://admin.athleteinstitute.ca';
  const editorUrl = site?.primaryHost ? `${siteOrigin(site)}/admin` : `${adminUrl}/sites`;
  await notify({ to: { email: em }, channels: ['email'], brandKey, template: 'generic', data: { heading: `You can now edit ${site?.name ?? 'the website'}`, body: `You've been added as ${role === 'admin' ? 'a Site admin' : role === 'editor' ? 'an Editor' : 'a Writer'}. Sign in with your Athlete Institute account (or create one with this email) at ${adminUrl}, open Websites and click Open editor.`, ctaLabel: 'Open the editor', ctaUrl: editorUrl } }).catch(() => {});
  return (await listMembers(brandKey)).find((m) => m.id === data.id)!;
}

/** The Site Editor system role makes a profile staff so admin.* opens. */
async function grantSiteEditorRole(profileId: number, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: role } = await db.from('roles').select('id').eq('name', 'Site Editor').maybeSingle();
  if (!role) return;
  const { data: has } = await db.from('role_assignments').select('id').eq('profile_id', profileId).eq('role_id', role.id).maybeSingle();
  if (!has) await db.from('role_assignments').insert({ profile_id: profileId, role_id: role.id, granted_by: actorClerkId }).select('id');
}

/** Claim invited rows on first sign-in (called from getOrCreateProfile consumers). */
export async function claimInvites(profileId: number, email: string | null): Promise<void> {
  if (!email) return;
  const db = supabaseAdmin();
  const { data } = await db.from('site_editor_scopes').select('id').eq('status', 'invited').is('profile_id', null).ilike('invited_email', email);
  if (!data?.length) return;
  await db.from('site_editor_scopes').update({ profile_id: profileId, status: 'active' }).in('id', data.map((d) => d.id));
  await grantSiteEditorRole(profileId, 'system:invite-claim');
}

export async function changeMemberRole(brandKey: string, id: number, role: SiteMember['role'], actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: m } = await db.from('site_editor_scopes').select('role, status, invited_email').eq('brand_key', brandKey).eq('id', id).maybeSingle();
  if (!m) throw new Error('Member not found.');
  if (m.role === 'admin' && role !== 'admin' && m.status === 'active' && (await adminCount(brandKey)) <= 1) throw new Error('This is the only Site admin. Make someone else a Site admin first.');
  await db.from('site_editor_scopes').update({ role }).eq('brand_key', brandKey).eq('id', id);
  await audit({ actorId: actorClerkId, action: 'scope.grant', target: `site:${brandKey}`, meta: { member: id, email: m.invited_email, role } });
}

export async function removeMember(brandKey: string, id: number, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: m } = await db.from('site_editor_scopes').select('role, status, invited_email, profile_id').eq('brand_key', brandKey).eq('id', id).maybeSingle();
  if (!m) return;
  if (m.role === 'admin' && m.status === 'active' && (await adminCount(brandKey)) <= 1) throw new Error('This is the only Site admin. Make someone else a Site admin first.');
  await db.from('site_editor_scopes').delete().eq('brand_key', brandKey).eq('id', id);
  await audit({ actorId: actorClerkId, action: 'scope.revoke', target: `site:${brandKey}`, meta: { member: id, email: m.invited_email, wasInvite: m.status === 'invited' } });
}

export async function resendInvite(brandKey: string, id: number): Promise<void> {
  const { data: m } = await supabaseAdmin().from('site_editor_scopes').select('invited_email, role').eq('brand_key', brandKey).eq('id', id).maybeSingle();
  if (!m?.invited_email) return;
  const { notify } = await import('@ai/foundation/notify');
  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://admin.athleteinstitute.ca';
  await notify({ to: { email: m.invited_email }, channels: ['email'], brandKey, template: 'generic', data: { heading: 'You can now edit the website', body: `Sign in with your Athlete Institute account (or create one with this email) and open Websites.`, ctaLabel: 'Open the editor', ctaUrl: `${adminUrl}/sites/${brandKey}` } }).catch(() => {});
}

/** Recent access changes from the audit log. */
export async function accessLog(brandKey: string, limit = 8): Promise<{ at: string; actor: string; action: string; meta: Record<string, unknown> }[]> {
  const { data } = await supabaseAdmin().from('audit_log').select('at, actor, action, meta').eq('target', `site:${brandKey}`).in('action', ['scope.grant', 'scope.revoke']).order('at', { ascending: false }).limit(limit);
  return (data ?? []).map((r) => ({ at: r.at, actor: r.actor, action: r.action, meta: (r.meta ?? {}) as Record<string, unknown> }));
}
