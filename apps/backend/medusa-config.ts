import { loadEnv, defineConfig } from "@medusajs/framework/utils"
import { woodrightAdminFaviconPlugin } from "./src/admin/vite/favicon-plugin"
import { woodrightAdminNormalizeHostPlugin } from "./src/admin/vite/normalize-admin-host-plugin"
import {
  validateAdminCorsPrivate,
  validateProductionAuthCors,
  validateProductionStoreCors,
} from "./src/lib/cors-origin-policy"
import {
  resolvePaymentLaunchMode,
  validatePaymentLaunchMode,
} from "./src/lib/payment-launch-mode"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

const nodeEnv = process.env.NODE_ENV || "development"
const isProduction = ["production", "prod"].includes(nodeEnv)
// medusa start defaults NODE_ENV to production; on local HTTP secure cookies are never sent.
const localHttp = process.env.MEDUSA_LOCAL_HTTP === "1"
const woodrightExposure = String(process.env.WOODRIGHT_EXPOSURE ?? "")
  .trim()
  .toLowerCase()
const isPublicExposure = woodrightExposure === "public"
const adminExposure = String(process.env.WOODRIGHT_ADMIN_EXPOSURE ?? "")
  .trim()
  .toLowerCase()
const adminExposureResolved =
  adminExposure === "" || adminExposure === "private" ? "private" : adminExposure

if (isPublicExposure && adminExposureResolved !== "private") {
  throw new Error(
    "WOODRIGHT_EXPOSURE=public requires WOODRIGHT_ADMIN_EXPOSURE=private (or unset)"
  )
}

const LOCAL_STORE_CORS =
  "http://localhost:3002,http://127.0.0.1:3002,http://localhost:8000,http://127.0.0.1:8000"
const LOCAL_ADMIN_CORS =
  "http://localhost:5173,http://localhost:9000,http://127.0.0.1:5173,http://127.0.0.1:9000"
const LOCAL_AUTH_CORS =
  "http://localhost:5173,http://localhost:8000,http://localhost:9000,http://127.0.0.1:5173,http://127.0.0.1:8000,http://127.0.0.1:9000"

function requireEnv(name: string, value: string | undefined, minLen = 1): string {
  const v = (value ?? "").trim()
  if (!v || v.length < minLen) {
    throw new Error(
      `${name} must be set${minLen > 1 ? ` (≥${minLen} chars)` : ""} in production`
    )
  }
  return v
}

function resolveCors(
  name: "STORE_CORS" | "ADMIN_CORS" | "AUTH_CORS",
  envValue: string | undefined,
  localDefault: string
): string {
  if (isProduction) {
    const required = requireEnv(name, envValue, 8)
    // Fail closed on wildcards / null origin tokens in production allowlists.
    if (required.includes("*") || /(^|,)\s*null\s*(,|$)/i.test(required)) {
      throw new Error(`${name} must not contain wildcards or null origins`)
    }
    // Public cutover profile: enforce apex STORE_CORS and private Admin CORS.
    // Private loopback candidates keep current allowlists without this gate.
    if (isPublicExposure) {
      if (name === "STORE_CORS") {
        const issues = validateProductionStoreCors(required)
        if (issues.length) {
          throw new Error(
            `STORE_CORS public profile invalid: ${issues.map((i) => i.code).join(", ")}`
          )
        }
      }
      if (name === "ADMIN_CORS") {
        const issues = validateAdminCorsPrivate(required)
        if (issues.length) {
          throw new Error(
            `ADMIN_CORS public profile invalid: ${issues.map((i) => i.code).join(", ")}`
          )
        }
      }
      if (name === "AUTH_CORS") {
        const issues = validateProductionAuthCors(required)
        if (issues.length) {
          throw new Error(
            `AUTH_CORS public profile invalid: ${issues.map((i) => i.code).join(", ")}`
          )
        }
      }
    }
    return required
  }
  return (envValue ?? localDefault).trim()
}

{
  const paymentIssues = validatePaymentLaunchMode(resolvePaymentLaunchMode())
  const blocking = paymentIssues.filter((i) => i.blocking)
  if (blocking.length && (isProduction || isPublicExposure)) {
    throw new Error(
      `WOODRIGHT_PAYMENT_LAUNCH_MODE invalid: ${blocking.map((i) => i.code).join(", ")}`
    )
  }
}

function resolveSecret(
  name: "JWT_SECRET" | "COOKIE_SECRET",
  envValue: string | undefined,
  localFallback: string
): string {
  if (isProduction) {
    return requireEnv(name, envValue, 32)
  }
  const v = (envValue ?? "").trim()
  return v.length >= 32 ? v : localFallback
}

if (isProduction && localHttp) {
  // Staging/demo is HTTPS behind Traefik. Ignoring MEDUSA_LOCAL_HTTP for cookies
  // prevents connect.sid without Secure (observed live misconfiguration).
  console.warn(
    "[woodright] MEDUSA_LOCAL_HTTP=1 is ignored in production for cookie Secure flags"
  )
}

export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL!,
    redisUrl: process.env.REDIS_URL,
    http: {
      // Hybrid storefront is :3002; Docker full profile historically publishes :8000.
      storeCors: resolveCors("STORE_CORS", process.env.STORE_CORS, LOCAL_STORE_CORS),
      adminCors: resolveCors("ADMIN_CORS", process.env.ADMIN_CORS, LOCAL_ADMIN_CORS),
      authCors: resolveCors("AUTH_CORS", process.env.AUTH_CORS, LOCAL_AUTH_CORS),
      jwtSecret: resolveSecret(
        "JWT_SECRET",
        process.env.JWT_SECRET,
        "supersecret-min-32-chars-required"
      ),
      cookieSecret: resolveSecret(
        "COOKIE_SECRET",
        process.env.COOKIE_SECRET,
        "supersecret-cookie-min-32chars!!"
      ),
    },
    // Production HTTPS: always Secure. Local HTTP only when not production.
    cookieOptions: isProduction
      ? { secure: true, sameSite: "lax" as const }
      : localHttp || !isProduction
        ? { secure: false, sameSite: "lax" as const }
        : { secure: true, sameSite: "lax" as const },
    sessionOptions:
      !isProduction || localHttp
        ? { saveUninitialized: true }
        : undefined,
  },
  admin: {
    // Embedded Admin must call the same origin. Absolute MEDUSA_BACKEND_URL
    // like http://localhost:9000 breaks login when the tab is opened as
    // http://127.0.0.1:9000 (cross-host session cookie / CORS on /auth).
    // Keep MEDUSA_BACKEND_URL for scripts; private Admin always prefers same-origin.
    // Explicit ADMIN_BACKEND_URL="" or unset under private Admin → "".
    backendUrl: (() => {
      if (Object.prototype.hasOwnProperty.call(process.env, "ADMIN_BACKEND_URL")) {
        return String(process.env.ADMIN_BACKEND_URL ?? "").trim()
      }
      if (adminExposureResolved === "private" || isPublicExposure) {
        return ""
      }
      if (localHttp || !isProduction) return ""
      return process.env.MEDUSA_BACKEND_URL || ""
    })(),
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
    {
      resolve: "./src/modules/product-sales",
    },
    {
      resolve: "./src/modules/order-process",
    },
  ],
})
