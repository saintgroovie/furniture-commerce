import { loadEnv, defineConfig } from "@medusajs/framework/utils"
import { woodrightDisableAdminHmrPlugin } from "./src/admin/vite/disable-hmr-plugin"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

const adminVitePort = Number(process.env.ADMIN_VITE_PORT || 5173)

export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL!,
    redisUrl: process.env.REDIS_URL,
    http: {
      storeCors: process.env.STORE_CORS ?? "http://localhost:8000,http://127.0.0.1:8000",
      adminCors:
        process.env.ADMIN_CORS ??
        "http://localhost:5173,http://localhost:9000,http://127.0.0.1:5173,http://127.0.0.1:9000",
      authCors:
        process.env.AUTH_CORS ??
        "http://localhost:5173,http://localhost:8000,http://localhost:9000,http://127.0.0.1:8000,http://127.0.0.1:9000",
      jwtSecret: process.env.JWT_SECRET ?? "supersecret-min-32-chars-required",
      cookieSecret: process.env.COOKIE_SECRET ?? "supersecret-cookie-min-32",
    },
    // Medusa defaults Secure+SameSite=None cookies when NODE_ENV=production.
    // Local HTTP `medusa start` QA cannot store those cookies — opt out explicitly.
    ...(process.env.COOKIE_SECURE === "0"
      ? {
          cookieOptions: {
            secure: false,
            sameSite: "lax" as const,
          },
        }
      : {}),
  },
  admin: {
    vite: (config) => {
      const adminHmrEnabled = process.env.ADMIN_VITE_HMR === "1"
      const baseHmr =
        config.server?.hmr && typeof config.server.hmr === "object"
          ? config.server.hmr
          : {}

      // Admin UI reads WOODRIGHT_ADMIN_UX_V1 via import.meta.env (not process.env).
      // Vite only auto-exposes VITE_* — bridge the existing flag name for browser runtime.
      const woodrightAdminUxFlag = process.env.WOODRIGHT_ADMIN_UX_V1 ?? ""
      const woodrightStorePublishableKey =
        process.env.WOODRIGHT_STORE_PUBLISHABLE_KEY ??
        process.env.MEDUSA_PUBLISHABLE_KEY ??
        ""

      // Expose WOODRIGHT_* to Admin Vite (default prefix is VITE_ only).
        // Vite allows envPrefix to be string | string[] — normalize before merge.
        const existingPrefix = config.envPrefix
        const prefixList = Array.isArray(existingPrefix)
          ? existingPrefix
          : existingPrefix
            ? [existingPrefix]
            : ["VITE_"]
        const envPrefix = Array.from(new Set([...prefixList, "VITE_", "WOODRIGHT_"]))

      return {
        ...config,
        envPrefix,
        define: {
          ...(config.define ?? {}),
          "import.meta.env.WOODRIGHT_ADMIN_UX_V1": JSON.stringify(woodrightAdminUxFlag),
          "import.meta.env.WOODRIGHT_STORE_PUBLISHABLE_KEY": JSON.stringify(
            woodrightStorePublishableKey
          ),
        },
        plugins: [
          ...(config.plugins ?? []),
          ...(adminHmrEnabled ? [] : [woodrightDisableAdminHmrPlugin()]),
        ],
        server: {
          ...config.server,
          host: "0.0.0.0",
          allowedHosts: ["localhost", ".localhost", "127.0.0.1"],
          ...(adminHmrEnabled
            ? {
                hmr: {
                  ...baseHmr,
                  port: adminVitePort,
                  clientPort: adminVitePort,
                },
              }
            : { hmr: false }),
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
      }
    },
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
