import { NextRequest, NextResponse } from 'next/server';
import { notify } from '@ai/foundation/notify';
import { renderNotification } from '@ai/foundation';

/**
 * DEV-ONLY. Two modes:
 *   ?preview=1&brand=bears&template=payment.reminder → returns the rendered
 *     email HTML (open in a browser to eyeball brand theming).
 *   (default) → calls notify() across all three channels and returns per-channel
 *     results, proving the resilience contract (missing keys/recipient →
 *     'skipped', never a throw). With real keys + recipient it actually sends.
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const sp = req.nextUrl.searchParams;
  const brand = sp.get('brand');

  if (sp.get('preview')) {
    const rendered = renderNotification(
      'payment.reminder',
      { amountLabel: '$125.00', dueLabel: 'Aug 1, 2026', payUrl: 'https://play.athleteinstitute.ca/pay/demo' },
      brand,
    );
    return new NextResponse(rendered.html, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  // Optional real send: pass ?email=you@x.ca (only sends if RESEND_API_KEY set).
  const email = sp.get('email');
  const result = await notify({
    to: { email: email ?? undefined, phone: sp.get('phone') ?? undefined },
    channels: ['email', 'sms', 'push'],
    template: 'waitlist.opening',
    data: {
      programName: 'U14 Skills Academy',
      claimUrl: 'https://play.athleteinstitute.ca/waitlist/demo',
      expiresLabel: '6:00 PM today',
    },
    brandKey: brand,
  });

  return NextResponse.json(result, { status: result.results.some((r) => r.status === 'error') ? 500 : 200 });
}
