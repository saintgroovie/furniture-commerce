/**
 * Server-only Medusa upstream for Next rewrites and SSR.
 * Never read NEXT_PUBLIC_* here — that baked the public :9000 host into
 * /product-static and blocked closing the published port.
 *
 * CommonJS so next.config.js can require this at build and `next start`.
 */

"use strict"

const ALLOWED_PROD_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "backend",
  "medusa",
  "host.docker.internal",
])

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
function resolveMedusaBackendInternalUrl(env = process.env) {
  const raw =
    env.MEDUSA_BACKEND_INTERNAL_URL ||
    env.MEDUSA_BACKEND_URL_INTERNAL ||
    env.MEDUSA_BACKEND_URL ||
    ""

  const trimmed = String(raw).trim().replace(/\/$/, "")
  const isProd = env.NODE_ENV === "production"

  if (!trimmed) {
    if (isProd) {
      throw new Error(
        "Missing MEDUSA_BACKEND_INTERNAL_URL (or MEDUSA_BACKEND_URL) for server-side Medusa upstream"
      )
    }
    return "http://localhost:9000"
  }

  let parsed
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error("Medusa internal backend URL is not a valid absolute URL")
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Medusa internal backend URL must be http(s)")
  }

  // Fail closed: never rewrite through the public VM review IP / storefront port.
  // Loopback IPv4 (127.0.0.1) is allowed — the dotted-quad check must not reject it.
  const isLoopbackHost =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "::1"
  const isDottedQuad = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(parsed.hostname)
  if (
    parsed.hostname === "89.169.188.29" ||
    parsed.port === "3002" ||
    (isDottedQuad && !isLoopbackHost)
  ) {
    throw new Error(
      "Medusa rewrite upstream must be Docker-internal or loopback — not a public IP"
    )
  }

  if (isProd && !ALLOWED_PROD_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `Medusa rewrite upstream host "${parsed.hostname}" is not in the allowlist`
    )
  }

  return trimmed
}

module.exports = {
  resolveMedusaBackendInternalUrl,
  ALLOWED_PROD_HOSTS,
}
