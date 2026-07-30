/**
 * CORS origin allowlist helpers for Medusa STORE/AUTH/ADMIN CORS.
 * Fail-closed: no wildcards, no suffix/prefix bypass, no null origin.
 */

export type CorsParseIssue = { code: string; message: string }

const LOCAL_RE = /^(localhost|127\.0\.0\.1|\[::1\])$/i
const DEMO_RE = /(^|\.)woodright-demo\.ru$/i

/** Approved public buyer Store CORS origins (exact match only). */
export const APPROVED_PUBLIC_STORE_ORIGINS = [
  "https://woodright.ru",
  "https://www.woodright.ru",
] as const

/** Approved private Admin CORS origins for public-exposure production profile. */
export const APPROVED_PRIVATE_ADMIN_ORIGINS = [
  "http://127.0.0.1:9200",
  "http://localhost:9200",
  "https://127.0.0.1:9200",
  "https://localhost:9200",
] as const

/** Auth CORS for public buyer surface (Admin auth stays on private Admin origins). */
export const APPROVED_PUBLIC_AUTH_ORIGINS = [
  ...APPROVED_PUBLIC_STORE_ORIGINS,
  ...APPROVED_PRIVATE_ADMIN_ORIGINS,
] as const

export function normalizeCorsOrigin(raw: string): string | null {
  const t = String(raw ?? "").trim()
  if (!t || t === "*" || t.toLowerCase() === "null") return null
  try {
    const u = new URL(t)
    if (u.username || u.password) return null
    if (u.pathname && u.pathname !== "/") return null
    if (u.search || u.hash) return null
    return `${u.protocol}//${u.host}`.toLowerCase()
  } catch {
    return null
  }
}

export function parseCorsAllowlist(raw: string | undefined | null): {
  origins: string[]
  issues: CorsParseIssue[]
} {
  const issues: CorsParseIssue[] = []
  const parts = String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const origins: string[] = []
  const seen = new Set<string>()
  for (const p of parts) {
    if (p === "*" || p.includes("*")) {
      issues.push({ code: "wildcard", message: `Wildcard CORS forbidden: ${p}` })
      continue
    }
    const o = normalizeCorsOrigin(p)
    if (!o) {
      issues.push({ code: "invalid_origin", message: `Invalid CORS origin: ${p}` })
      continue
    }
    if (!seen.has(o)) {
      seen.add(o)
      origins.push(o)
    }
  }
  return { origins, issues }
}

export function originIsAllowed(
  requestOrigin: string | undefined | null,
  allowlist: string[]
): boolean {
  const o = normalizeCorsOrigin(String(requestOrigin ?? ""))
  if (!o) return false
  return allowlist.includes(o)
}

function denyUnapproved(
  origins: string[],
  approved: readonly string[],
  code: string
): CorsParseIssue[] {
  const allow = new Set(approved)
  const out: CorsParseIssue[] = []
  for (const o of origins) {
    if (!allow.has(o)) {
      out.push({
        code,
        message: `Unapproved CORS origin for public profile: ${o}`,
      })
    }
  }
  return out
}

/** Public production Store CORS: exact approved buyer origins only. */
export function validateProductionStoreCors(raw: string): CorsParseIssue[] {
  const { origins, issues } = parseCorsAllowlist(raw)
  const out = [...issues]
  if (!origins.includes("https://woodright.ru")) {
    out.push({
      code: "missing_apex",
      message: "STORE_CORS must include https://woodright.ru",
    })
  }
  out.push(
    ...denyUnapproved(origins, APPROVED_PUBLIC_STORE_ORIGINS, "unapproved_store_origin")
  )
  for (const o of origins) {
    const host = new URL(o).hostname
    if (o.startsWith("http://") && !LOCAL_RE.test(host)) {
      out.push({
        code: "http_non_local",
        message: `Non-local HTTP origin forbidden: ${o}`,
      })
    }
    if (DEMO_RE.test(host)) {
      out.push({
        code: "demo_in_production",
        message: `Demo origin forbidden in production CORS: ${o}`,
      })
    }
  }
  return out
}

/** Public-profile Admin CORS: loopback/private only; never buyer apex or admin DNS. */
export function validateAdminCorsPrivate(raw: string): CorsParseIssue[] {
  const { origins, issues } = parseCorsAllowlist(raw)
  const out = [...issues]
  if (!origins.length) {
    out.push({
      code: "admin_cors_empty",
      message: "ADMIN_CORS must list private loopback Admin origins",
    })
  }
  out.push(
    ...denyUnapproved(origins, APPROVED_PRIVATE_ADMIN_ORIGINS, "unapproved_admin_origin")
  )
  for (const o of origins) {
    const host = new URL(o).hostname
    if (host === "woodright.ru" || host === "www.woodright.ru") {
      out.push({
        code: "admin_on_buyer_host",
        message: "Admin CORS must not use public buyer apex",
      })
    }
    if (host === "admin.woodright.ru") {
      out.push({
        code: "admin_public_host",
        message: "admin.woodright.ru is not part of the approved private Admin profile",
      })
    }
  }
  return out
}

/** Public-profile Auth CORS: buyer HTTPS apex/www + private Admin loopback only. */
export function validateProductionAuthCors(raw: string): CorsParseIssue[] {
  const { origins, issues } = parseCorsAllowlist(raw)
  const out = [...issues]
  if (!origins.includes("https://woodright.ru")) {
    out.push({
      code: "missing_apex",
      message: "AUTH_CORS must include https://woodright.ru",
    })
  }
  out.push(
    ...denyUnapproved(origins, APPROVED_PUBLIC_AUTH_ORIGINS, "unapproved_auth_origin")
  )
  return out
}
