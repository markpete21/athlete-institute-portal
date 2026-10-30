import 'server-only';
import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { accessForProfile, getPortalSession, type PortalSession } from '@/lib/auth';
import type { Profile } from '@/lib/profile';

/**
 * Editor sessions on a brand host (owner decision, Oct 30 2026: every site is
 * edited at its own domain, e.g. allcansport.ca/admin).
 *
 * Two ways to be signed in there:
 *   1. A Clerk session, once the host is a Clerk satellite (Clerk Pro).
 *   2. A hand-off from the portal Admin: "Open editor" mints a 5-minute,
 *      single-purpose token for the signed-in person; the brand host swaps
 *      it for a 12-hour httpOnly cookie bound to their profile. This works
 *      before the satellite exists and keeps working after.
 * Both resolve to the same PortalSession shape, so the role checks are shared.
 */
const HANDOFF_TTL_MS = 5 * 60 * 1000;
const COOKIE_TTL_MS = 12 * 60 * 60 * 1000;

function secret(): string {
  return process.env.SITE_PREVIEW_SECRET ?? process.env.CLERK_SECRET_KEY ?? 'dev-preview-secret';
}
const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');
const safeEq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

function mint(kind: 'handoff' | 'cookie', brandKey: string, profileId: number, ttl: number): string {
  const payload = `${kind}.${brandKey}.${profileId}.${Date.now() + ttl}`;
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;
}

function verify(kind: 'handoff' | 'cookie', token: string | null | undefined, brandKey: string): number | null {
  if (!token) return null;
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return null;
  let payload: string;
  try { payload = Buffer.from(b64, 'base64url').toString('utf8'); } catch { return null; }
  const [k, bk, pid, exp] = payload.split('.');
  if (k !== kind || bk !== brandKey || !pid || !exp || Number(exp) < Date.now()) return null;
  if (!safeEq(sig, sign(payload))) return null;
  return Number(pid);
}

export const editorCookieName = (brandKey: string) => `site_editor_${brandKey.replace(/[^a-z0-9]/g, '_')}`;
export const mintHandoffToken = (brandKey: string, profileId: number) => mint('handoff', brandKey, profileId, HANDOFF_TTL_MS);
export const verifyHandoffToken = (token: string | null | undefined, brandKey: string) => verify('handoff', token, brandKey);
export const mintEditorCookie = (brandKey: string, profileId: number) => mint('cookie', brandKey, profileId, COOKIE_TTL_MS);
export const EDITOR_COOKIE_MAX_AGE = COOKIE_TTL_MS / 1000;

/** Session for a profile id (the cookie path): same access resolution as a Clerk session. */
async function sessionForProfileId(profileId: number): Promise<PortalSession | null> {
  const { data } = await supabaseAdmin().from('profiles').select('id, clerk_user_id, email, first_name, last_name, phone, user_type, status, settings, family_id').eq('id', profileId).maybeSingle();
  if (!data || data.status !== 'active') return null;
  const { access, profile } = await accessForProfile(data as Profile);
  return { userId: profile.clerk_user_id, email: profile.email, profileId: profile.id, familyId: profile.family_id, status: profile.status, ...access, canTransact: false };
}

/**
 * The signed-in person on a brand host's editor: Clerk first (satellite), then
 * the hand-off cookie. Returns the signed-out shell when neither exists.
 */
export async function getSiteSession(brandKey: string): Promise<PortalSession & { via: 'clerk' | 'cookie' | null }> {
  let clerk: PortalSession | null = null;
  try { clerk = await getPortalSession(); } catch { clerk = null; }
  if (clerk?.userId) return { ...clerk, via: 'clerk' };
  const pid = verify('cookie', cookies().get(editorCookieName(brandKey))?.value, brandKey);
  if (pid) {
    const s = await sessionForProfileId(pid);
    if (s) return { ...s, via: 'cookie' };
  }
  return { userId: null, email: null, profileId: null, familyId: null, status: null, userType: 'customer', roles: [], isStaff: false, canTransact: false, via: null } as PortalSession & { via: null };
}
