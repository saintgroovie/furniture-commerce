import type { NextConfig } from "next"
import { LEGACY_REDIRECTS } from "./src/lib/nav"

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next-build",
  poweredByHeader: false,
  /**
   * Legacy employee URLs → Woodright OS sections as real 307s (before any render).
   * Object deep links (`/people/:id`, `/requests/:id`) stay as they are.
   */
  async redirects() {
    return [
      ...Object.entries(LEGACY_REDIRECTS).map(([source, destination]) => ({ source, destination, permanent: false })),
      { source: "/products/:id", destination: "/catalog/:id", permanent: false },
    ]
  },
}

export default nextConfig
