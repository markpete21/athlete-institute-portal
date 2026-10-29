import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Staff preview tokens (Module 23 §6.3): `?preview=<token>` on the brand host
 * renders DRAFT blocks and ignores the launch switch. The token is an HMAC of
 * (brandKey, profileId, expiry) so it needs no Clerk session on the brand
 * host (works before the satellite domain exists) but is bound to a staff
 * profile with site access and expires after an hour.
 */

const TTL_MS = 60 * 60 * 1000;

function secret(): string {
  return process.env.SITE_PREVIEW_SECRET ?? process.env.CLERK_SECRET_KEY ?? 'dev-preview-secret';
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function mintPreviewToken(brandKey: string, profileId: number): string {
  const exp = Date.now() + TTL_MS;
  const payload = `${brandKey}.${profileId}.${exp}`;
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;
}

export function verifyPreviewToken(token: string | null | undefined, brandKey: string): { ok: boolean; profileId?: number } {
  if (!token) return { ok: false };
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return { ok: false };
  let payload: string;
  try { payload = Buffer.from(b64, 'base64url').toString('utf8'); } catch { return { ok: false }; }
  const [bk, pid, exp] = payload.split('.');
  if (bk !== brandKey || !pid || !exp) return { ok: false };
  if (Number(exp) < Date.now()) return { ok: false };
  const expected = sign(payload);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false };
  return { ok: true, profileId: Number(pid) };
}
