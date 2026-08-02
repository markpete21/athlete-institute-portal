/** @type {import('next').NextConfig} */
const nextConfig = {
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
