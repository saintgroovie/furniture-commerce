/**
 * Guest order-track token handoff (fragment contract).
 *
 * Primary contract: `/orders/track?order_id=<id>#token=<opaque>`
 * URL fragments are not sent in HTTP requests, so Traefik/nginx/backend
 * cannot log the token and Next SSR/RSC never receives it.
 *
 * Legacy `?token=` query links are not supported (Option A): middleware
 * strips the query param without consuming the token into session/cookie.
 */

/** SessionStorage key for a given Medusa order id. */
export function orderTrackSessionKey(orderId: string): string {
  return `woodright_order_token:${orderId}`
}

/**
 * Build buyer-facing track path. Token lives only in the fragment.
 * Safe to put in mint JSON / checkout href - the HTTP request target omits `#…`.
 */
export function buildGuestOrderTrackPath(
  orderId: string,
  token: string
): string {
  const id = orderId.trim()
  const t = token.trim()
  if (!id || !t) {
    throw new Error("order_id and token are required for track path")
  }
  return `/orders/track?order_id=${encodeURIComponent(id)}#token=${encodeURIComponent(t)}`
}

/**
 * Parse `#token=…` (optionally with other fragment params). Returns null if absent/malformed.
 */
export function parseOrderTrackFragmentToken(hash: string): string | null {
  const raw = (hash ?? "").trim()
  if (!raw) return null
  const body = raw.startsWith("#") ? raw.slice(1) : raw
  if (!body) return null
  try {
    const params = new URLSearchParams(body)
    const token = (params.get("token") ?? "").trim()
    return token || null
  } catch {
    return null
  }
}

/**
 * Strip legacy `?token=` from /orders/track search without handoff.
 * Returns nextSearch when a query token was present; otherwise null.
 */
export function stripLegacyQueryTokenFromOrderTrackSearch(
  pathname: string,
  search: string
): { nextSearch: string } | null {
  if (pathname !== "/orders/track") return null
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  )
  if (!params.has("token")) return null
  params.delete("token")
  const next = params.toString()
  return { nextSearch: next ? `?${next}` : "" }
}
