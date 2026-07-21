/** @type {import('next').NextConfig} */
const path = require("path")
const {
  resolveMedusaBackendInternalUrl,
} = require("./medusa-backend-internal-url.cjs")

// Server-only upstream for rewrites. Do NOT prefer NEXT_PUBLIC_* here — that baked
// the public :9000 host into /product-static and blocked closing the published port.
const backendUrl = resolveMedusaBackendInternalUrl(process.env)

// Monorepo root (apps/storefront → ../..) so standalone tracing includes the few
// backend/src/lib gallery helpers imported via relative paths.
const monorepoRoot = path.join(__dirname, "../..")

const nextConfig = {
  reactStrictMode: true,
  // Slim runtime image: traced server + minimal node_modules (not full yarn tree).
  output: "standalone",
  // Honest production typecheck (includes QA App Router routes). Do not use
  // ignoreBuildErrors — buyer build must fail on real production TS errors.
  typescript: {
    tsconfigPath: "./tsconfig.production.json",
  },
  // QA: :3002 and :3004 run separate `next dev` from the same app — isolate caches.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // Required when storefront lives under apps/ and imports ../../../backend/...
    outputFileTracingRoot: monorepoRoot,
  },
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
      // Same-origin Store API for browser cart/checkout — avoids public :9000.
      {
        source: "/store/:path*",
        destination: `${backendUrl}/store/:path*`,
      },
      // Same-origin uploads (rare legacy paths) — avoid emitting public :9000 in img src.
      {
        source: "/uploads/:path*",
        destination: `${backendUrl}/uploads/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
