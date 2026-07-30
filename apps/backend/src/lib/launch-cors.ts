/**
 * Woodright public-launch CORS validators (backend).
 *
 * These are opt-in gates, not a change to the live running CORS behavior:
 * the private candidate today runs loopback-only STORE_CORS/ADMIN_CORS, and
 * requiring apex+www unconditionally in `medusa-config.ts` would break that
 * candidate until a redeploy ships the new env. Wiring is gated behind
 * `WOODRIGHT_LAUNCH_CORS_PROFILE=production_buyer` - see `medusa-config.ts`.
 *
 * Primary use: the public-launch readiness checker
 * (`scripts/release/check-public-launch-readiness.cjs`) and unit tests
 * (`launch-cors.fidelity.test.ts`).
 */

export const PRODUCTION_STORE_ORIGINS = [
  "https://woodright.ru",
  "https://www.woodright.ru",
] as const

/** woodright-demo.ru and known subdomains - never valid in a production buyer/admin CORS list. */
export const DEMO_CORS_HOSTS = [
  "woodright-demo.ru",
  "www.woodright-demo.ru",
  "api.woodright-demo.ru",
] as const

/**
 * Optional private-candidate QA origin allowed alongside production origins
 * only when `WOODRIGHT_RUNTIME_EXPOSURE=private` and role is
 * `production_candidate` (see `assertProductionStoreCors`).
 */
export const PRIVATE_CANDIDATE_QA_ORIGIN = "http://127.0.0.1:3200" as const

const LOOPBACK_HOSTNAME_RE = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)$/i

/** Parse a CORS env value (comma-separated) into a trimmed, non-empty list. */
export function parseCorsOrigins(csv: string | undefined | null): string[] {
  return String(csv ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
}

/** Alias used by tests/readiness checker for readability. */
export const parseCorsList = parseCorsOrigins

function isDemoOrigin(origin: string): boolean {
  const url = parseOrigin(origin)
  if (!url) return false
  const host = url.hostname.toLowerCase()
  return DEMO_CORS_HOSTS.some((demo) => host === demo || host.endsWith(`.${demo}`))
}

function parseOrigin(origin: string): URL | undefined {
  try {
    return new URL(origin)
  } catch {
    return undefined
  }
}

export type AssertProductionStoreCorsEnv = {
  runtimeExposure?: string | null
  runtimeRole?: string | null
}

/**
 * Production buyer STORE_CORS must equal exactly the apex + www origins.
 *
 * The only exception: a private `production_candidate` (never public) may
 * additionally allow the loopback QA origin `http://127.0.0.1:3200` next to
 * the two production origins - never in place of them, and never for a
 * public role/exposure.
 */
export function assertProductionStoreCors(
  origins: string[],
  env: AssertProductionStoreCorsEnv = {}
): void {
  if (!origins.length) {
    throw new Error("STORE_CORS must not be empty for the production buyer profile")
  }
  if (origins.includes("*")) {
    throw new Error('STORE_CORS must not include "*" for the production buyer profile')
  }
  for (const origin of origins) {
    if (isDemoOrigin(origin)) {
      throw new Error(`STORE_CORS must not include a demo host: "${origin}"`)
    }
  }

  const isExactProduction =
    origins.length === PRODUCTION_STORE_ORIGINS.length &&
    PRODUCTION_STORE_ORIGINS.every((origin) => origins.includes(origin))
  if (isExactProduction) return

  const exposure = String(env.runtimeExposure ?? "").trim()
  const role = String(env.runtimeRole ?? "").trim()
  const allowPrivateCandidateQa = exposure === "private" && role === "production_candidate"

  if (allowPrivateCandidateQa) {
    const hasAllProduction = PRODUCTION_STORE_ORIGINS.every((origin) => origins.includes(origin))
    const onlyKnownOrigins = origins.every(
      (origin) =>
        origin === PRIVATE_CANDIDATE_QA_ORIGIN ||
        (PRODUCTION_STORE_ORIGINS as readonly string[]).includes(origin)
    )
    const expectedLength = PRODUCTION_STORE_ORIGINS.length + 1
    if (hasAllProduction && onlyKnownOrigins && origins.length === expectedLength) {
      return
    }
    throw new Error(
      `STORE_CORS for a private production_candidate must be exactly [${PRODUCTION_STORE_ORIGINS.join(", ")}] plus optional "${PRIVATE_CANDIDATE_QA_ORIGIN}", got: [${origins.join(", ")}]`
    )
  }

  throw new Error(
    `STORE_CORS must equal exactly [${PRODUCTION_STORE_ORIGINS.join(", ")}] for the production buyer profile, got: [${origins.join(", ")}]`
  )
}

/**
 * Production ADMIN_CORS must never expose a public `*.woodright.ru` admin
 * host. Loopback and other (non-woodright.ru, non-demo) origins are treated
 * as "restricted" access (VPN/allowlisted networks) and are allowed here -
 * operational network allowlisting is out of scope for this validator.
 */
export function assertProductionAdminCors(origins: string[]): void {
  if (!origins.length) {
    throw new Error("ADMIN_CORS must not be empty for the production buyer profile")
  }
  if (origins.includes("*")) {
    throw new Error('ADMIN_CORS must not include "*"')
  }
  for (const origin of origins) {
    if (isDemoOrigin(origin)) {
      throw new Error(`ADMIN_CORS must not include a demo host: "${origin}"`)
    }
    const url = parseOrigin(origin)
    if (!url) {
      throw new Error(`ADMIN_CORS origin is not a valid absolute URL: "${origin}"`)
    }
    const host = url.hostname.toLowerCase()
    if (LOOPBACK_HOSTNAME_RE.test(host)) continue
    if (host === "admin.woodright.ru" || host === "woodright.ru" || host === "www.woodright.ru" || host.endsWith(".woodright.ru")) {
      throw new Error(`ADMIN_CORS must not expose a public woodright.ru admin host: "${origin}"`)
    }
  }
}

/**
 * AUTH_CORS for the production buyer profile must include every STORE origin
 * and may additionally include private Admin origins (loopback / non-public).
 * Reject wildcard, demo hosts, empty lists, and public woodright.ru admin hosts.
 */
export function assertProductionAuthCors(
  origins: string[],
  env: AssertProductionStoreCorsEnv = {}
): void {
  if (!origins.length) {
    throw new Error("AUTH_CORS must not be empty for the production buyer profile")
  }
  if (origins.includes("*")) {
    throw new Error('AUTH_CORS must not include "*" for the production buyer profile')
  }
  for (const origin of origins) {
    if (isDemoOrigin(origin)) {
      throw new Error(`AUTH_CORS must not include a demo host: "${origin}"`)
    }
    const url = parseOrigin(origin)
    if (!url) {
      throw new Error(`AUTH_CORS origin is not a valid absolute URL: "${origin}"`)
    }
    const host = url.hostname.toLowerCase()
    if (host === "admin.woodright.ru") {
      throw new Error(`AUTH_CORS must not expose public admin.woodright.ru: "${origin}"`)
    }
  }

  const missingStore = PRODUCTION_STORE_ORIGINS.filter((o) => !origins.includes(o))
  if (missingStore.length) {
    throw new Error(
      `AUTH_CORS must include every STORE buyer origin; missing: [${missingStore.join(", ")}]`
    )
  }

  const exposure = String(env.runtimeExposure ?? "").trim()
  const role = String(env.runtimeRole ?? "").trim()
  const allowPrivateQa = exposure === "private" && role === "production_candidate"

  for (const origin of origins) {
    if ((PRODUCTION_STORE_ORIGINS as readonly string[]).includes(origin)) continue
    if (allowPrivateQa && origin === PRIVATE_CANDIDATE_QA_ORIGIN) continue
    const url = parseOrigin(origin)!
    const host = url.hostname.toLowerCase()
    if (LOOPBACK_HOSTNAME_RE.test(host)) continue
    throw new Error(
      `AUTH_CORS extra origin must be private/loopback (or private-candidate QA), got: "${origin}"`
    )
  }
}

/** Unknown launch CORS profiles must fail closed (never silently ignored). */
export function assertKnownLaunchCorsProfile(raw: string | undefined | null): void {
  const v = String(raw ?? "").trim()
  if (!v) return
  if (v === "production_buyer") return
  throw new Error(
    `Unknown WOODRIGHT_LAUNCH_CORS_PROFILE="${v}" - only "production_buyer" (or unset) is allowed`
  )
}
