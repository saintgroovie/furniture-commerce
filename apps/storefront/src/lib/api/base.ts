export function getBaseUrl(): string {
  if (typeof window === "undefined" && process.env.MEDUSA_BACKEND_URL) {
    const serverUrl = process.env.MEDUSA_BACKEND_URL
    // Docker SSR: compose sets medusa:9000 but backend may run on host (host.docker.internal).
    if (serverUrl.includes("://medusa:")) {
      return "http://host.docker.internal:9000"
    }
    return serverUrl
  }
  return process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? ""
}

/** Base URL of the storefront for metadataBase, canonical, OG. */
export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:8000"
}

function getPublishableKey(): string {
  return process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""
}

/** Fetch wrapper that adds the publishable API key header. */
export function medusaFetch(url: string, init?: RequestInit): Promise<Response> {
  const key = getPublishableKey()
  const headers = new Headers(init?.headers)
  if (key) {
    headers.set("x-publishable-api-key", key)
  }
  // Cart / checkout / mutations must never be served from Next Data Cache.
  return fetch(url, { ...init, headers, cache: "no-store" })
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
    return fetch(url, { ...init, headers, cache: "no-store" })
  }

  return fetch(url, {
    ...init,
    headers,
    next: { revalidate },
  })
}
