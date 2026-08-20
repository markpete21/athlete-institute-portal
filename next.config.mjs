// Report-Only CSP baseline (pre-launch). Third parties actually in use:
// Clerk (script/connect/img/worker; Turnstile bot-detection frames), Supabase
// Storage public/signed URLs (img), Stripe (hosted Checkout is a redirect, but
// js.stripe.com/frames are allowed for when Elements lands). 'unsafe-inline' /
// 'unsafe-eval' match Next 14 + Clerk requirements; tighten to nonces before
// flipping to enforcing Content-Security-Policy.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://clerk.athleteinstitute.ca https://challenges.cloudflare.com https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://img.clerk.com https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.clerk.accounts.dev https://clerk.athleteinstitute.ca https://*.supabase.co https://api.stripe.com",
  "frame-src https://challenges.cloudflare.com https://js.stripe.com https://hooks.stripe.com",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy-Report-Only', value: csp },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  reactStrictMode: true,
  // Escape hatch so a production build can go somewhere other than .next:
  //   NEXT_DIST_DIR=.next-buildcheck npm run build
  // Building into .next while a dev server is running wipes that server's
  // output and leaves it serving unstyled pages until it's restarted.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // @ai/foundation ships TypeScript source; Next transpiles it in-place.
  transpilePackages: ['@ai/foundation'],
  experimental: {
    // Required in Next 14 for instrumentation.ts (boots the audit DB sink).
    instrumentationHook: true,
  },
};

export default nextConfig;
