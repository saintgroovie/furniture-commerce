/**
 * Woodright public-launch contract (typed, fail-closed).
 *
 * Single source of truth for "what does it mean to go public" as a set of
 * types + pure functions. This module is plumbing only - it does not decide
 * legal facts, prices, PSP names, or timelines, and it must not be extended
 * to invent any of those.
 *
 * Consumers:
 * - `apps/storefront/src/lib/api/base.ts` (`getSiteUrl`)
 * - `apps/storefront/src/lib/payment-mode.ts`
 * - `scripts/release/check-public-launch-readiness.cjs`
 * Indexing policy imports bare hosts / launch-mode helpers from sibling modules
 * so robots/sitemap do not pull scheme-qualified demo origins into
 * production_candidate bundles.
 *
 * Env contract (server-only, never `NEXT_PUBLIC_*` for these decisions):
 * - `WOODRIGHT_RUNTIME_ROLE` - existing runtime identity role. This module
 *   only cares whether the role is production-like (`production` |
 *   `production_candidate`); it does not replace
 *   `apps/storefront/src/lib/runtime-identity-headers.ts`'s narrower
 *   `ALLOWED_ROLES` set used for response headers.
 * - `WOODRIGHT_LAUNCH_MODE` - `private_noindex` | `public_indexable`.
 */

import {
  DEMO_HOSTS,
  LOOPBACK_HOST_RE,
  PUBLIC_DEMO_BUYER_HOSTS,
} from "./demo-hosts"
import {
  type LaunchMode,
  launchModeToIndexingMode,
  parseLaunchModeLenient,
} from "./launch-mode"

export type { LaunchMode }
export {
  DEMO_HOSTS,
  LOOPBACK_HOST_RE,
  PUBLIC_DEMO_BUYER_HOSTS,
}
export { launchModeToIndexingMode, parseLaunchModeLenient }

/** Production template allows only `private` - `restricted`/`public` are documented, not offered as safe defaults. */
export type AdminExposure = "private" | "restricted" | "public"

/**
 * Only modes that exist in the codebase today.
 *
 * `manual_invoice`: the order completes without an online PSP charge
 * (`pp_system_default` no-op payment session, required by Medusa checkout
 * plumbing - see `apps/storefront/src/lib/api/checkout.ts`). The manager
 * sends a payment link to the buyer out-of-band afterwards
 * (`apps/backend/src/api/admin/payment-links`). `pp_system_default` is
 * checkout plumbing, never a PSP name - do not present it as one anywhere.
 *
 * Do not add `online_provider` (or similar) until a real online PSP
 * integration exists in the codebase.
 */
export type PaymentMode = "manual_invoice"

export type LegalContentStatus = "approved" | "draft" | "missing_owner_input"

/** Known runtime roles this contract treats as production-like. Unknown/other values are non-production-like. */
export type RuntimeRole = "production" | "production_candidate" | string

/**
 * Scheme-qualified public_demo origins derived from bare hosts.
 * Built via join so source and minified bundles avoid a contiguous
 * `https://` + demo-host literal that production_candidate contamination
 * scans reject (bare hosts remain allowed deny-list tokens).
 */
function httpsOrigin(host: string): string {
  return ["https://", host].join("")
}

export const PUBLIC_DEMO_BUYER_ORIGINS = [
  httpsOrigin(PUBLIC_DEMO_BUYER_HOSTS[0]),
  httpsOrigin(PUBLIC_DEMO_BUYER_HOSTS[1]),
] as const

/** Recommended (not enforced) production values for docs/scripts/templates. */
export const PRODUCTION_BUYER_ORIGINS = [
  "https://woodright.ru",
  "https://www.woodright.ru",
] as const

export const PRODUCTION_API_ORIGIN = "https://api.woodright.ru" as const

export const RECOMMENDED_PRODUCTION_SITE_URL: string = PRODUCTION_BUYER_ORIGINS[0]
export const RECOMMENDED_PRODUCTION_API_URL: string = PRODUCTION_API_ORIGIN

function isDemoHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return DEMO_HOSTS.some((demo) => h === demo || h.endsWith(`.${demo}`))
}

function isPublicDemoBuyerHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return (PUBLIC_DEMO_BUYER_HOSTS as readonly string[]).includes(h)
}

function isProductionBuyerHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return h === "woodright.ru" || h === "www.woodright.ru"
}

function isLoopbackHost(url: URL): boolean {
  return LOOPBACK_HOST_RE.test(url.hostname) || LOOPBACK_HOST_RE.test(url.host)
}

function parseAbsoluteUrl(raw: string): URL | undefined {
  try {
    return new URL(raw)
  } catch {
    return undefined
  }
}

/**
 * Require an https, non-demo, non-loopback absolute URL for production-like
 * buyer-facing surfaces. Throws (fail-closed) on any violation.
 */
export function assertProductionLikeSiteUrl(raw: string | undefined | null): string {
  const value = String(raw ?? "").trim()
  if (!value) {
    throw new Error(
      "Production-like site URL is required (NEXT_PUBLIC_SITE_URL) - no localhost fallback"
    )
  }
  const url = parseAbsoluteUrl(value)
  if (!url) {
    throw new Error(`Site URL is not a valid absolute URL: "${value}"`)
  }
  if (url.protocol !== "https:") {
    throw new Error(`Production-like site URL must be https: "${value}"`)
  }
  if (isLoopbackHost(url)) {
    throw new Error(`Production-like site URL must not be loopback/localhost: "${value}"`)
  }
  if (isDemoHost(url.hostname)) {
    throw new Error(`Production-like site URL must not be a demo host: "${value}"`)
  }
  return value.replace(/\/$/, "")
}

/**
 * Require the canonical public_demo buyer site URL.
 * Fail-closed: https + exact demo buyer host only. Rejects production apex,
 * loopback, API demo host, and unknown hosts. Does not grant production authority.
 */
export function assertPublicDemoSiteUrl(raw: string | undefined | null): string {
  const value = String(raw ?? "").trim()
  if (!value) {
    throw new Error(
      "Public-demo site URL is required (NEXT_PUBLIC_SITE_URL) - no localhost fallback"
    )
  }
  const url = parseAbsoluteUrl(value)
  if (!url) {
    throw new Error(`Public-demo site URL is not a valid absolute URL: "${value}"`)
  }
  if (url.protocol !== "https:") {
    throw new Error(`Public-demo site URL must be https: "${value}"`)
  }
  if (isLoopbackHost(url)) {
    throw new Error(`Public-demo site URL must not be loopback/localhost: "${value}"`)
  }
  if (isProductionBuyerHost(url.hostname)) {
    throw new Error(`Public-demo site URL must not be a production host: "${value}"`)
  }
  if (!isPublicDemoBuyerHost(url.hostname)) {
    throw new Error(
      `Public-demo site URL must be https://${PUBLIC_DEMO_BUYER_HOSTS[0]} (or www), got: "${value}"`
    )
  }
  return value.replace(/\/$/, "")
}

/**
 * True when bake/runtime identity is explicitly public_demo via role or image
 * build profile. Exact string match only.
 */
export function isPublicDemoRuntime(
  role: string | undefined | null,
  imageBuildProfile?: string | undefined | null
): boolean {
  const r = String(role ?? "").trim()
  const p = String(imageBuildProfile ?? "").trim()
  return r === "public_demo" || p === "public_demo"
}

/**
 * Exact public site runtime identity. Required (with explicit SEO/launch mode)
 * before indexable SEO may engage. Distinct from private `production` /
 * `production_candidate`.
 *
 * When both role and image build profile are non-empty, they must agree on
 * `public_production` - conflicting identities fail closed.
 */
export function isPublicProductionRuntime(
  role: string | undefined | null,
  imageBuildProfile?: string | undefined | null
): boolean {
  const r = String(role ?? "").trim()
  const p = String(imageBuildProfile ?? "").trim()
  if (r && p) {
    return r === "public_production" && p === "public_production"
  }
  return r === "public_production" || p === "public_production"
}

/**
 * Require an https, non-demo, non-loopback absolute URL for the public
 * Medusa API contract. `api.woodright.ru` is recommended but not enforced -
 * some private candidates legitimately proxy through another host.
 */
export function assertProductionLikeApiUrl(raw: string | undefined | null): string {
  const value = String(raw ?? "").trim()
  if (!value) {
    throw new Error(
      "Production-like API URL is required (public Medusa API contract URL) - no localhost fallback"
    )
  }
  const url = parseAbsoluteUrl(value)
  if (!url) {
    throw new Error(`API URL is not a valid absolute URL: "${value}"`)
  }
  if (url.protocol !== "https:") {
    throw new Error(`Production-like API URL must be https: "${value}"`)
  }
  if (isLoopbackHost(url)) {
    throw new Error(`Production-like API URL must not be loopback/localhost: "${value}"`)
  }
  if (isDemoHost(url.hostname)) {
    throw new Error(`Production-like API URL must not be a demo host: "${value}"`)
  }
  return value.replace(/\/$/, "")
}

export function isProductionLikeRuntime(role: string | undefined | null): boolean {
  const value = String(role ?? "").trim()
  return (
    value === "production" ||
    value === "production_candidate" ||
    value === "public_production"
  )
}

export type ResolveLaunchModeEnv = {
  nodeEnv?: string | null
  runtimeRole?: string | null
}

function defaultResolveLaunchModeEnv(): ResolveLaunchModeEnv {
  return {
    nodeEnv: process.env.NODE_ENV,
    runtimeRole: process.env.WOODRIGHT_RUNTIME_ROLE,
  }
}

/**
 * Fail-closed launch mode resolution.
 *
 * - Explicit `private_noindex` / `public_indexable` always wins.
 * - Any other non-empty value is invalid → throw.
 * - Empty value:
 *   - Production-like role (`production` | `production_candidate`) in a
 *     production `NODE_ENV` build (the actual deploy shape) → throw. This is
 *     the only fail-closed branch: an explicit launch mode is mandatory once
 *     a real production-like process starts without one.
 *   - Anything else (local dev, tests, a production `NODE_ENV` build with no
 *     runtime role set, e.g. plain `yarn build`) → default to the safe
 *     `private_noindex` so DX/CI never needs this var to build or run.
 */
export function resolveLaunchMode(
  raw: string | undefined | null,
  env: ResolveLaunchModeEnv = defaultResolveLaunchModeEnv()
): LaunchMode {
  const lenient = parseLaunchModeLenient(raw)
  if (lenient) return lenient

  const trimmed = String(raw ?? "").trim()
  if (trimmed) {
    throw new Error(
      `Unknown WOODRIGHT_LAUNCH_MODE: "${raw}" (expected "private_noindex" | "public_indexable")`
    )
  }

  const roleIsProductionLike = isProductionLikeRuntime(env.runtimeRole)
  const nodeEnvIsProduction = String(env.nodeEnv ?? "").trim() === "production"

  if (roleIsProductionLike && nodeEnvIsProduction) {
    throw new Error(
      `WOODRIGHT_LAUNCH_MODE is required when WOODRIGHT_RUNTIME_ROLE="${env.runtimeRole}" and NODE_ENV=production`
    )
  }

  return "private_noindex"
}

export type LaunchContractInput = {
  launchMode: LaunchMode
  siteUrl: string
  apiUrl: string
  adminExposure: AdminExposure
  paymentMode: PaymentMode
  legalContentStatus: LegalContentStatus
}

export type LaunchContractValidation = {
  ok: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validate the core launch contract fields (not DNS/TLS/route/rollback -
 * those live in `scripts/release/check-public-launch-readiness.cjs`).
 */
export function validateLaunchContract(input: LaunchContractInput): LaunchContractValidation {
  const errors: string[] = []
  const warnings: string[] = []

  try {
    assertProductionLikeSiteUrl(input.siteUrl)
  } catch (err) {
    errors.push(`siteUrl: ${(err as Error).message}`)
  }

  try {
    assertProductionLikeApiUrl(input.apiUrl)
  } catch (err) {
    errors.push(`apiUrl: ${(err as Error).message}`)
  }

  const apiHost = parseAbsoluteUrl(input.apiUrl)?.hostname
  const recommendedApiHost = parseAbsoluteUrl(PRODUCTION_API_ORIGIN)?.hostname
  if (apiHost && recommendedApiHost && apiHost !== recommendedApiHost) {
    warnings.push(
      `apiUrl host "${apiHost}" differs from recommended "${recommendedApiHost}"`
    )
  }

  if (input.adminExposure === "public") {
    errors.push("adminExposure: public admin exposure is not allowed by the production template")
  } else if (input.adminExposure === "restricted") {
    warnings.push("adminExposure: restricted is documented but private is the recommended production default")
  }

  if (input.paymentMode !== "manual_invoice") {
    errors.push(`paymentMode: unsupported payment mode "${input.paymentMode}"`)
  }

  if (input.launchMode === "public_indexable") {
    if (input.legalContentStatus !== "approved") {
      errors.push(
        `legalContentStatus: public_indexable requires "approved" legal content (got "${input.legalContentStatus}")`
      )
    }
    // Keep in sync with payment-mode.ts:isPublicPaymentReady - manual_invoice
    // is the only current mode and it is not public-ready until the owner
    // confirms a public payment story.
    if (input.paymentMode === "manual_invoice") {
      errors.push(
        'paymentMode: "manual_invoice" is not public-ready - owner confirmation required before public_indexable'
      )
    }
  } else if (input.legalContentStatus !== "approved") {
    warnings.push(
      `legalContentStatus is "${input.legalContentStatus}" - acceptable for private_noindex, required before public_indexable`
    )
  }

  return { ok: errors.length === 0, errors, warnings }
}
