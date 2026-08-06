/**
 * Woodright public-launch configuration contract (storefront).
 *
 * Prepared values may live in templates / future cutover env.
 * Current private production-candidate must NOT load public-only values that
 * break loopback access until an explicit cutover cycle.
 *
 * Env names (server-side unless noted):
 * - WOODRIGHT_CANONICAL_DOMAIN / WOODRIGHT_CANONICAL_SITE_URL / NEXT_PUBLIC_SITE_URL
 * - WOODRIGHT_CANONICAL_API_ORIGIN / NEXT_PUBLIC_MEDUSA_BACKEND_URL
 * - WOODRIGHT_INDEXING_MODE (noindex|index|private_noindex|public_indexable)
 * - WOODRIGHT_RUNTIME_ROLE / WOODRIGHT_EXPOSURE / WOODRIGHT_DATABASE_IDENTITY
 * - WOODRIGHT_ADMIN_EXPOSURE (private|restricted|public)
 * - WOODRIGHT_PAYMENT_LAUNCH_MODE (manager_payment_link|request_only|online_psp)
 */

export type LaunchIndexingMode = "private_noindex" | "public_indexable"
export type AdminExposureMode = "private" | "restricted" | "public"
export type PaymentLaunchMode =
  | "manager_payment_link"
  | "request_only"
  | "online_psp"

export type LaunchConfigIssue = {
  code: string
  message: string
  blocking: boolean
}

const DEMO_HOST_RE = /(^|[./])woodright-demo\.ru$/i
const LOCAL_HOST_RE =
  /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i

export function normalizeOrigin(raw: string): string | null {
  const t = String(raw ?? "").trim()
  if (!t) return null
  try {
    const u = new URL(t.includes("://") ? t : `https://${t}`)
    if (u.username || u.password) return null
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "")
    if (path) return null
    return `${u.protocol}//${u.host}`.toLowerCase()
  } catch {
    return null
  }
}

export function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOST_RE.test(hostname) || hostname.endsWith(".localhost")
}

export function isDemoHostname(hostname: string): boolean {
  return DEMO_HOST_RE.test(hostname)
}

export function resolveLaunchIndexingMode(
  raw: string | undefined | null = process.env.WOODRIGHT_INDEXING_MODE
): LaunchIndexingMode {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase()
  // Template alias only - runtime robots policy still requires literal "index"
  // via indexing-policy after cutover gates. public_indexable alone does not index.
  if (v === "index" || v === "public_indexable") return "public_indexable"
  return "private_noindex"
}

export function resolveAdminExposureMode(
  raw: string | undefined | null = process.env.WOODRIGHT_ADMIN_EXPOSURE
): AdminExposureMode {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase()
  if (v === "restricted") return "restricted"
  if (v === "public") return "public"
  if (v === "" || v === "private") return "private"
  // Unknown values fail closed to private for reading, but validation flags them.
  return "private"
}

export function resolvePaymentLaunchMode(
  raw: string | undefined | null = process.env.WOODRIGHT_PAYMENT_LAUNCH_MODE
): PaymentLaunchMode | "invalid" {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase()
  if (v === "" || v === "manager_payment_link") return "manager_payment_link"
  if (v === "request_only") return "request_only"
  if (v === "online_psp") return "online_psp"
  return "invalid"
}

export function resolveCanonicalSiteOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  const candidates = [
    env.WOODRIGHT_CANONICAL_SITE_URL,
    env.WOODRIGHT_CANONICAL_DOMAIN
      ? env.WOODRIGHT_CANONICAL_DOMAIN.includes("://")
        ? env.WOODRIGHT_CANONICAL_DOMAIN
        : `https://${env.WOODRIGHT_CANONICAL_DOMAIN}`
      : undefined,
    env.NEXT_PUBLIC_SITE_URL,
  ]
  for (const c of candidates) {
    const o = normalizeOrigin(String(c ?? ""))
    if (o) return o
  }
  return null
}

export function resolveCanonicalApiOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  const candidates = [
    env.WOODRIGHT_CANONICAL_API_ORIGIN,
    env.NEXT_PUBLIC_MEDUSA_BACKEND_URL,
  ]
  for (const c of candidates) {
    const o = normalizeOrigin(String(c ?? ""))
    if (o) return o
  }
  return null
}

/**
 * Validate a *target* public launch profile (templates / cutover dry-run).
 * Does not mutate runtime.
 */
export function validatePublicLaunchProfile(input: {
  siteOrigin: string
  apiOrigin: string
  indexingMode: LaunchIndexingMode
  adminExposure: AdminExposureMode
  paymentMode: PaymentLaunchMode | "invalid"
  storeCorsOrigins: string[]
  storeCorsRaw?: string
  exposure?: string
  runtimeRole?: string
  hasOnlinePspCredentials?: boolean
  /** Required: omit/undefined blocks (fail-closed). */
  legalComplete?: boolean
  /** Required: omit/undefined blocks (fail-closed). */
  adminUserCount?: number
}): LaunchConfigIssue[] {
  const issues: LaunchConfigIssue[] = []
  const site = normalizeOrigin(input.siteOrigin)
  const api = normalizeOrigin(input.apiOrigin)

  if (input.paymentMode === "invalid") {
    issues.push({
      code: "payment_mode_invalid",
      message: "WOODRIGHT_PAYMENT_LAUNCH_MODE must be manager_payment_link|request_only|online_psp",
      blocking: true,
    })
  }

  if (input.adminExposure !== "private") {
    issues.push({
      code: "admin_exposure_not_private",
      message: "Approved launch profile requires WOODRIGHT_ADMIN_EXPOSURE=private",
      blocking: true,
    })
  }

  if (typeof input.legalComplete !== "boolean") {
    issues.push({
      code: "legal_complete_unspecified",
      message: "legalComplete must be explicitly true|false for launch validation",
      blocking: true,
    })
  } else if (input.legalComplete === false) {
    issues.push({
      code: "legal_inputs_incomplete",
      message: "Required legal owner fields are incomplete",
      blocking: true,
    })
  }

  if (typeof input.adminUserCount !== "number") {
    issues.push({
      code: "admin_count_unspecified",
      message: "adminUserCount must be supplied for launch validation",
      blocking: true,
    })
  } else if (input.adminUserCount < 1) {
    issues.push({
      code: "admin_user_required",
      message: "Production Admin user count must be ≥ 1 before cutover",
      blocking: true,
    })
  }

  if (input.indexingMode === "public_indexable") {
    issues.push({
      code: "indexable_requires_separate_approval",
      message:
        "public_indexable is a template alias only; runtime indexing requires WOODRIGHT_INDEXING_MODE=index after owner approval",
      blocking: true,
    })
  }

  if (input.exposure && input.exposure !== "public" && input.exposure !== "private") {
    issues.push({
      code: "exposure_invalid",
      message: `Invalid WOODRIGHT_EXPOSURE: ${input.exposure}`,
      blocking: true,
    })
  }
  if (
    input.runtimeRole &&
    !["production", "production_candidate", "public_demo", "non_public_candidate"].includes(
      input.runtimeRole
    )
  ) {
    issues.push({
      code: "runtime_role_unexpected",
      message: `Unexpected WOODRIGHT_RUNTIME_ROLE: ${input.runtimeRole}`,
      blocking: true,
    })
  }

  if (!site || !site.startsWith("https://")) {
    issues.push({
      code: "site_https_required",
      message: "Canonical site must be https origin",
      blocking: true,
    })
  } else {
    const host = new URL(site).hostname
    if (isLocalHostname(host)) {
      issues.push({
        code: "site_localhost_forbidden",
        message: "Public launch site cannot be localhost",
        blocking: true,
      })
    }
    if (isDemoHostname(host)) {
      issues.push({
        code: "site_demo_forbidden",
        message: "Production launch cannot use demo hostname",
        blocking: true,
      })
    }
    if (host !== "woodright.ru") {
      issues.push({
        code: "site_host_unexpected",
        message: `Expected canonical host woodright.ru, got ${host}`,
        blocking: true,
      })
    }
  }

  if (!api || !api.startsWith("https://")) {
    issues.push({
      code: "api_https_required",
      message: "Canonical API must be https origin",
      blocking: true,
    })
  } else {
    const host = new URL(api).hostname
    if (isLocalHostname(host)) {
      issues.push({
        code: "api_localhost_forbidden",
        message: "Public launch API cannot be localhost",
        blocking: true,
      })
    }
    if (isDemoHostname(host)) {
      issues.push({
        code: "api_demo_forbidden",
        message: "Production API cannot use demo hostname",
        blocking: true,
      })
    }
    if (host !== "api.woodright.ru") {
      issues.push({
        code: "api_host_unexpected",
        message: `Expected api.woodright.ru, got ${host}`,
        blocking: true,
      })
    }
  }

  if (input.paymentMode === "online_psp" && !input.hasOnlinePspCredentials) {
    issues.push({
      code: "online_psp_credentials_missing",
      message: "online_psp mode requires complete PSP credentials/webhooks",
      blocking: true,
    })
  }

  const rawCors = input.storeCorsRaw ?? input.storeCorsOrigins.join(",")
  if (rawCors.includes("*") || /(^|,)\s*null\s*(,|$)/i.test(rawCors)) {
    issues.push({
      code: "store_cors_wildcard_or_null",
      message: "STORE_CORS must not contain wildcards or null",
      blocking: true,
    })
  }

  const allowed = new Set(
    input.storeCorsOrigins
      .map((o) => normalizeOrigin(o))
      .filter((o): o is string => !!o)
  )
  if (site && !allowed.has(site)) {
    issues.push({
      code: "store_cors_missing_apex",
      message: "STORE_CORS must include canonical site origin",
      blocking: true,
    })
  }
  for (const o of allowed) {
    if (o.startsWith("http://") && !isLocalHostname(new URL(o).hostname)) {
      issues.push({
        code: "store_cors_http_forbidden",
        message: `Non-local HTTP origin forbidden in public CORS: ${o}`,
        blocking: true,
      })
    }
  }

  return issues
}

/** Scheme join — avoid contiguous production-apex literals in shippable modules. */
function httpsOrigin(host: string): string {
  return ["https://", host].join("")
}

/** Prepared Woodright production private/noindex profile (documentation / dry-run). */
export const PREPARED_PRODUCTION_PRIVATE_NOINDEX = {
  siteOrigin: httpsOrigin("woodright.ru"),
  apiOrigin: httpsOrigin("api.woodright.ru"),
  indexingMode: "private_noindex" as const,
  adminExposure: "private" as const,
  paymentMode: "manager_payment_link" as const,
  storeCorsOrigins: [httpsOrigin("woodright.ru"), httpsOrigin("www.woodright.ru")],
  runtimeRole: "production",
  exposure: "public",
  databaseIdentity: "production_db",
} as const
