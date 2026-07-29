/**
 * Medusa API base URL.
 * - Server: Docker-internal / loopback from server-only env (never NEXT_PUBLIC).
 * - Browser: same-origin empty base so `/store/...` hits Next rewrites → backend.
 *
 * No localhost:9000 / host.docker.internal string literals here — this module is
 * imported by Client Components (cart/checkout) and must not embed :9000 hosts.
 */
export function getBaseUrl(): string {
  if (typeof window !== "undefined") {
    return ""
  }

  const raw =
    process.env.MEDUSA_BACKEND_INTERNAL_URL ||
    process.env.MEDUSA_BACKEND_URL_INTERNAL ||
    process.env.MEDUSA_BACKEND_URL ||
    ""
  const trimmed = String(raw).trim().replace(/\/$/, "")

  if (!trimmed) {
    throw new Error(
      "Missing MEDUSA_BACKEND_INTERNAL_URL (or MEDUSA_BACKEND_URL) for server-side Medusa fetches"
    )
  }

  return trimmed
}

/** Base URL of the storefront for metadataBase, canonical, OG. */
export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:8000"
}

function getPublishableKey(): string {
  return process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""
}

/** Default server-side Medusa fetch budget (build/SSR without a live backend). */
const DEFAULT_MEDUSA_FETCH_TIMEOUT_MS = 8_000

function withMedusaTimeout(init?: RequestInit): RequestInit {
  if (init?.signal) return init ?? {}
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
    return { ...init, signal: AbortSignal.timeout(DEFAULT_MEDUSA_FETCH_TIMEOUT_MS) }
  }
  return init ?? {}
}

/** Fetch wrapper that adds the publishable API key header. */
export function medusaFetch(url: string, init?: RequestInit): Promise<Response> {
  const key = getPublishableKey()
  const headers = new Headers(init?.headers)
  if (key) {
    headers.set("x-publishable-api-key", key)
  }
  const timed = withMedusaTimeout(init)
  // Cart / checkout / mutations must never be served from Next Data Cache.
  return fetch(url, { ...timed, headers, cache: "no-store" })
}

/**
 * Read-only catalog / RoomSet membership fetches.
 * Uses a short Next.js revalidate window so repeat SSR of /catalog does not
 * wait on Medusa every time. Cart and mutations stay on `medusaFetch`.
 *
 * Override TTL with `MEDUSA_CATALOG_REVALIDATE_SECONDS` (default 60).
 * Set to `0` to force no-store (debug / emergency stale-price bypass).
 */
export function medusaCatalogFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const key = getPublishableKey()
  const headers = new Headers(init?.headers)
  if (key) {
    headers.set("x-publishable-api-key", key)
  }

  const raw = process.env.MEDUSA_CATALOG_REVALIDATE_SECONDS
  const parsed =
    raw === undefined || raw === "" ? 60 : Number.parseInt(raw, 10)
  const revalidate = Number.isFinite(parsed) ? parsed : 60

  if (revalidate <= 0) {
    const timed = withMedusaTimeout(init)
    return fetch(url, { ...timed, headers, cache: "no-store" })
  }

  const timed = withMedusaTimeout(init)
  return fetch(url, {
    ...timed,
    headers,
    next: { revalidate },
  })
}
