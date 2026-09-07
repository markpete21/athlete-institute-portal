import { NextRequest, NextResponse } from 'next/server';
import { audit } from '@ai/foundation';
import { jsonError, secretsMatch } from '@/lib/api/handlers';
import { AuthError, requireStaffCapability } from '@/lib/auth';
import { qboExchangeCode } from '@/lib/quickbooks/qbo';

export const dynamic = 'force-dynamic';

/** Intuit redirects here with ?code&realmId&state. Verifies state, stores tokens, returns to the reports page. */
export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireStaffCapability('pay', 'edit');
  } catch (err) {
    if (err instanceof AuthError) return jsonError(err.message, err.code === 'signed_out' ? 401 : 403);
    throw err;
  }
  const code = req.nextUrl.searchParams.get('code');
  const realmId = req.nextUrl.searchParams.get('realmId');
  const state = req.nextUrl.searchParams.get('state');
  const expected = req.cookies.get('ai_qbo_state')?.value;
  if (!code || !realmId) return jsonError('Missing code or realmId from Intuit.', 400);
  if (!secretsMatch(state, expected)) return jsonError('OAuth state mismatch — start again from the reports page.', 400);

  await qboExchangeCode(code, realmId);
  await audit({ actorId: session.userId, action: 'qbo.connected', target: `qbo:${realmId}` });

  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL ?? `${req.nextUrl.protocol}//${req.headers.get('host') ?? req.nextUrl.host}`;
  const res = NextResponse.redirect(`${adminUrl}/reports?qbo=connected`);
  res.cookies.delete('ai_qbo_state');
  return res;
}
