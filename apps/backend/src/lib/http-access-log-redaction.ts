/**
 * Redact sensitive query values from URLs before HTTP access logging.
 *
 * Medusa production access logs use morgan `tokens.url(req)` which defaults to
 * `req.originalUrl` (path + query). Legacy guest `?token=` must never persist
 * as plaintext in those logs.
 */

const SENSITIVE_QUERY_KEYS = new Set([
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "auth_token",
  "guest_token",
  "password",
  "passwd",
  "secret",
  "api_key",
  "apikey",
])

const REDACTED = "[REDACTED]"

function decodeQueryKey(rawKey: string): string {
  try {
    return decodeURIComponent(rawKey.replace(/\+/g, " ")).toLowerCase()
  } catch {
    return rawKey.toLowerCase()
  }
}

function isSensitiveQueryKey(rawKey: string): boolean {
  return SENSITIVE_QUERY_KEYS.has(decodeQueryKey(rawKey))
}

/**
 * Redact sensitive query parameter values in a request URL / originalUrl.
 * Preserves path, fragment (unused by HTTP), and non-sensitive query keys.
 */
export function redactUrlForAccessLog(raw: string | undefined | null): string {
  if (raw == null || raw === "") {
    return "-"
  }
  const input = String(raw)
  const hashIdx = input.indexOf("#")
  const withoutHash = hashIdx >= 0 ? input.slice(0, hashIdx) : input
  const qIdx = withoutHash.indexOf("?")
  if (qIdx < 0) {
    return withoutHash
  }
  const path = withoutHash.slice(0, qIdx)
  const query = withoutHash.slice(qIdx + 1)
  if (!query) {
    return path
  }

  const parts = query.split("&").filter((p) => p.length > 0)
  const redacted = parts.map((part) => {
    const eq = part.indexOf("=")
    if (eq < 0) {
      return isSensitiveQueryKey(part) ? `${part}=${REDACTED}` : part
    }
    const key = part.slice(0, eq)
    if (isSensitiveQueryKey(key)) {
      return `${key}=${REDACTED}`
    }
    return part
  })

  return `${path}?${redacted.join("&")}`
}

type UrlCarrier = {
  originalUrl?: string
  url?: string
}

/**
 * Mutate Express-like request URL fields so any logger reading them sees
 * redacted query values. Does not remove Authorization (auth must keep working).
 */
export function redactRequestUrlsForAccessLog(req: UrlCarrier): void {
  if (typeof req.originalUrl === "string") {
    req.originalUrl = redactUrlForAccessLog(req.originalUrl)
  }
  if (typeof req.url === "string") {
    req.url = redactUrlForAccessLog(req.url)
  }
}

let registered = false

/**
 * Override morgan's `url` token so Medusa's JSON access logger never persists
 * plaintext sensitive query values. Safe to call multiple times.
 *
 * Fail-closed: if morgan cannot be required/overridden, throws so startup does
 * not silently serve without redaction. `registered` is set only after success.
 */
export function registerHttpAccessLogRedaction(): void {
  if (registered) {
    return
  }
  // Declared direct dependency for production hardening (also transitive via Medusa).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const morgan = require("morgan") as {
    token: (name: string, fn: (req: UrlCarrier) => string) => void
  }
  if (typeof morgan?.token !== "function") {
    throw new Error(
      "http-access-log-redaction: morgan.token unavailable; refusing to start without URL redaction"
    )
  }
  morgan.token("url", (req: UrlCarrier) =>
    redactUrlForAccessLog(req.originalUrl || req.url || "-")
  )
  registered = true
}
