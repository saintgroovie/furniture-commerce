import { loadEnv, defineConfig } from "@medusajs/framework/utils"
import { woodrightAdminFaviconPlugin } from "./src/admin/vite/favicon-plugin"
import { woodrightAdminNormalizeHostPlugin } from "./src/admin/vite/normalize-admin-host-plugin"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

const nodeEnv = process.env.NODE_ENV || "development"
const isProduction = ["production", "prod"].includes(nodeEnv)
// medusa start defaults NODE_ENV to production; on local HTTP secure cookies are never sent.
const localHttp = process.env.MEDUSA_LOCAL_HTTP === "1"

export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL!,
    redisUrl: process.env.REDIS_URL,
    http: {
      // Hybrid storefront is :3002; Docker full profile historically publishes :8000.
      storeCors:
        process.env.STORE_CORS ??
        "http://localhost:3002,http://127.0.0.1:3002,http://localhost:8000,http://127.0.0.1:8000",
      adminCors:
        process.env.ADMIN_CORS ??
        "http://localhost:5173,http://localhost:9000,http://127.0.0.1:5173,http://127.0.0.1:9000",
      authCors:
        process.env.AUTH_CORS ??
        "http://localhost:5173,http://localhost:8000,http://localhost:9000,http://127.0.0.1:5173,http://127.0.0.1:8000,http://127.0.0.1:9000",
      jwtSecret: process.env.JWT_SECRET ?? "supersecret-min-32-chars-required",
      cookieSecret: process.env.COOKIE_SECRET ?? "supersecret-cookie-min-32",
    },
    cookieOptions:
      localHttp || !isProduction
        ? { secure: false, sameSite: "lax" as const }
        : undefined,
    sessionOptions:
      localHttp || !isProduction
        ? { saveUninitialized: true }
        : undefined,
  },
  admin: {
    // Embedded Admin must call the same origin. Absolute MEDUSA_BACKEND_URL
    // like http://localhost:9000 breaks login when the tab is opened as
    // http://127.0.0.1:9000 (cross-host session cookie / CORS on /auth).
    // Keep MEDUSA_BACKEND_URL for scripts; Admin uses same-origin unless overridden.
    backendUrl:
      process.env.ADMIN_BACKEND_URL ??
      (localHttp || !isProduction ? "" : process.env.MEDUSA_BACKEND_URL || ""),
    vite: (config) => ({
      ...config,
      plugins: [
        ...(config.plugins ?? []),
        woodrightAdminNormalizeHostPlugin(),
        woodrightAdminFaviconPlugin(),
      ],
      server: {
        ...config.server,
        host: "0.0.0.0",
        allowedHosts: ["localhost", ".localhost", "127.0.0.1"],
        hmr: {
          port: 5173,
          clientPort: 5173,
        },
        // Do not restart Admin Vite on media/tmp churn (catalog photos live under static/)
        watch: {
          ignored: [
            "**/node_modules/**",
            "**/uploads/**",
            "**/static/**",
            "**/.medusa/**",
            "**/private/**",
            "**/tmp/**",
            "**/test-results/**",
            "**/.next/**",
          ],
        },
      },
    }),
  },
  modules: [
    {
      resolve: "./src/modules/product-extension",
    },
    {
      resolve: "./src/modules/room-set",
    },
    {
      resolve: "./src/modules/lead",
    },
    {
      resolve: "./src/modules/bespoke-request",
    },
    {
      resolve: "./src/modules/payment-link",
    },
  ],
})
