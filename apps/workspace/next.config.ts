import type { NextConfig } from "next";
const config: NextConfig = {
  basePath: process.env.NEXT_PUBLIC_WORKSPACE_BASE_PATH || "",
  distDir: ".next-build",
  poweredByHeader: false,
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Woodright-Workspace-Source-Sha",
            value: process.env.WOODRIGHT_WORKSPACE_SOURCE_SHA || "local",
          },
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
          },
        ],
      },
    ];
  },
};
export default config;
