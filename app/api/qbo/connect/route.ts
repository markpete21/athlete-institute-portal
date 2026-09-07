import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/api/handlers';
import { AuthError, requireStaffCapability } from '@/lib/auth';
import { qboAuthUrl } from '@/lib/quickbooks/qbo';

export const dynamic = 'force-dynamic';

/**
 * Start the QuickBooks OAuth dance (staff with the pay capability). A random
 * state is parked in an httpOnly cookie and echoed by Intuit; the callback
 * compares the two so a forged callback cannot bind someone else's realm.
 */
export async function GET() {
  try {
    await requireStaffCapability('pay', 'edit');
  } catch (err) {
    if (err instanceof AuthError) return jsonError(err.message, err.code === 'signed_out' ? 401 : 403);
    throw err;
  }
  const state = randomBytes(16).toString('base64url');
  const url = qboAuthUrl(state);
  if (!url) return jsonError('QuickBooks is not configured (QBO_CLIENT_ID / QBO_REDIRECT_URI).', 503);
  const res = NextResponse.redirect(url);
  res.cookies.set('ai_qbo_state', state, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 600, path: '/' });
  return res;
}
