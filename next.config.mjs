/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @ai/foundation ships TypeScript source; Next transpiles it in-place.
  transpilePackages: ['@ai/foundation'],
  experimental: {
    // Required in Next 14 for instrumentation.ts (boots the audit DB sink).
    instrumentationHook: true,
  },
};

export default nextConfig;
