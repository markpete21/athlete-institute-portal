/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @ai/foundation ships TypeScript source; Next transpiles it in-place.
  transpilePackages: ['@ai/foundation'],
};

export default nextConfig;
