/** @type {import('next').NextConfig} */
const backendUrl =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
  process.env.MEDUSA_BACKEND_URL ||
  "http://localhost:9000"

const nextConfig = {
  reactStrictMode: true,
  // QA: :3002 and :3004 run separate `next dev` from the same app — isolate caches.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  webpack: (config, { dev }) => {
    // QA tradeoff: disable webpack FS cache in dev only — prevents corrupted .next/cache
    // pack ENOENT → intermittent 404 on /catalog during HMR. Production build unaffected.
    if (dev) {
      config.cache = false
    }
    return config
  },
  async rewrites() {
    return [
      {
        source: "/product-static/:path*",
        destination: `${backendUrl}/static/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
