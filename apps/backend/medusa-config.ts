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

      return {
        ...config,
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
