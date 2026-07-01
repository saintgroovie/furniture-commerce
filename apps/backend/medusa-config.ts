import { loadEnv, defineConfig } from "@medusajs/framework/utils"
import { woodrightAdminDefaultLocalePlugin } from "./src/admin/vite/default-locale-plugin"
import { woodrightDisableAdminHmrPlugin } from "./src/admin/vite/disable-hmr-plugin"
import { adminViteCacheDir, finalizeOrPruneViteCache } from "./src/admin/vite/finalize-vite-cache.mjs"
import { woodrightPruneViteCachePlugin } from "./src/admin/vite/prune-vite-cache-plugin"
import { woodrightStaleChunkReloadPlugin } from "./src/admin/vite/stale-chunk-reload-plugin"
import { woodrightAdminEagerRouteDepsChunks } from "./src/admin/vite/eager-route-deps"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

const backendPort = Number(process.env.PORT ?? 9000)
const adminVitePort = Number(process.env.ADMIN_VITE_PORT ?? 5173)

/** Merge .env CORS lists with dynamic local ports (9000/9001, 5173/5174). */
function mergeOrigins(...lists: Array<string | undefined>): string {
  const origins = new Set<string>()
  for (const list of lists) {
    if (!list) continue
    for (const origin of list.split(",")) {
      const trimmed = origin.trim()
      if (trimmed) origins.add(trimmed)
    }
  }
  return [...origins].join(",")
}

const localAdminOrigins = [
  `http://localhost:${adminVitePort}`,
  `http://127.0.0.1:${adminVitePort}`,
  `http://localhost:${backendPort}`,
  `http://127.0.0.1:${backendPort}`,
]
const defaultAuthOrigins = [
  ...localAdminOrigins,
  "http://localhost:8000",
  "http://127.0.0.1:8000",
  // dev:admin-local alternate ports when mixed with .env pinned to 9000
  "http://localhost:9001",
  "http://127.0.0.1:9001",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
]

const nodeEnv = process.env.NODE_ENV || "development"
const isProduction = ["production", "prod"].includes(nodeEnv)
// medusa start defaults NODE_ENV to production; on local HTTP secure cookies are never sent.
const localHttp = process.env.MEDUSA_LOCAL_HTTP === "1"
const useRedis =
  Boolean(process.env.REDIS_URL) &&
  !localHttp &&
  (isProduction || process.env.LOCAL_USE_REDIS === "1")

/** Отдельный Vite cache на пару портов — без гонок dev / dev:admin-local. */
const adminViteCacheDirPath = adminViteCacheDir(
  process.cwd(),
  backendPort,
  adminVitePort,
)

// До старта Vite: финализировать deps_temp_* после прерванного optimize-deps.
finalizeOrPruneViteCache(adminViteCacheDirPath)

export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL!,
    redisUrl: useRedis ? process.env.REDIS_URL : undefined,
    http: {
      storeCors: process.env.STORE_CORS ?? "http://localhost:8000,http://127.0.0.1:8000",
      adminCors: mergeOrigins(process.env.ADMIN_CORS, localAdminOrigins.join(",")),
      authCors: mergeOrigins(process.env.AUTH_CORS, defaultAuthOrigins.join(",")),
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
    vite: (config) => {
      const baseHmr =
        config.server?.hmr && typeof config.server.hmr === "object"
          ? config.server.hmr
          : {}

      const adminHmrEnabled = process.env.ADMIN_VITE_HMR === "1"
      const stabilityPlugins = adminHmrEnabled
        ? []
        : [woodrightDisableAdminHmrPlugin()]

      return {
        ...config,
        plugins: [
          ...(config.plugins ?? []),
          woodrightPruneViteCachePlugin(adminViteCacheDirPath),
          woodrightAdminDefaultLocalePlugin(),
          woodrightStaleChunkReloadPlugin(),
          ...stabilityPlugins,
        ],
        cacheDir: adminViteCacheDirPath,
        optimizeDeps: {
          ...config.optimizeDeps,
          // See eager-route-deps.ts: avoids mid-session re-optimize hangs
          // (categories/collections/etc. — routes outside the cold-start crawl).
          include: [
            ...(config.optimizeDeps?.include ?? []),
            ...woodrightAdminEagerRouteDepsChunks(process.cwd()),
            // Observed (DEBUG=vite:deps) as a late "new dependencies found" wave
            // right after the eager dashboard-dist chunks are bundled — not
            // statically reachable, only imported from deep inside already-
            // bundled dashboard chunks. Declaring them here folds that second
            // wave into the one cold-start pass too.
            "@medusajs/admin-shared",
            "@medusajs/admin-sdk",
          ],
        },
        server: {
          ...config.server,
          host: "0.0.0.0",
          allowedHosts: ["localhost", ".localhost", "127.0.0.1"],
          ...(adminHmrEnabled
            ? { hmr: { ...baseHmr, overlay: false } }
            : { hmr: false }),
          watch: {
            ignored: [
              "**/node_modules/**",
              "**/uploads/**",
              "**/static/**",
              "**/.medusa/**",
              "**/private/**",
              "**/tmp/**",
              "**/test-results/**",
            ],
          },
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
