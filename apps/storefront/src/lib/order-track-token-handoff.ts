/**
 * Guest order-track token handoff.
 *
 * Inbound email/SMS links may include ?token=… . Next.js App Router serializes
 * the request URL into bootstrap/Flight (`urlParts`), which would echo the
 * plaintext token into initial HTML. Middleware moves the token into a
 * short-lived cookie and redirects to a token-free URL before render.
 */

export const ORDER_TRACK_HANDOFF_COOKIE = "wr_ot_handoff"

/** SessionStorage key for a given Medusa order id. */
export function orderTrackSessionKey(orderId: string): string {
  return `woodright_order_token:${orderId}`
}

/**
 * Cookie payload binds token to order_id so concurrent track navigations
 * cannot poison sessionStorage with the wrong token.
 * Format: `<urlencoded_order_id>|<urlencoded_token>`
 */
export function encodeOrderTrackHandoff(
  orderId: string,
  token: string
): string {
  return `${encodeURIComponent(orderId)}|${encodeURIComponent(token)}`
}

export function decodeOrderTrackHandoff(
  raw: string
): { orderId: string; token: string } | null {
  const s = (raw ?? "").trim()
  if (!s) return null
  const bar = s.indexOf("|")
  if (bar <= 0) return null
  try {
    const orderId = decodeURIComponent(s.slice(0, bar)).trim()
    const token = decodeURIComponent(s.slice(bar + 1)).trim()
    if (!orderId || !token) return null
    return { orderId, token }
  } catch {
    return null
  }
}

/**
 * Returns a redirect pathname+search without `token`, or null if no strip needed.
 * Pure helper for fidelity tests (no Next types).
 */
export function stripTokenFromOrderTrackSearch(
  pathname: string,
  search: string
): { nextSearch: string; token: string; orderId: string } | null {
  if (pathname !== "/orders/track") return null
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  )
  const token = (params.get("token") ?? "").trim()
  if (!token) return null
  const orderId = (params.get("order_id") ?? "").trim()
  params.delete("token")
  const next = params.toString()
  return { token, orderId, nextSearch: next ? `?${next}` : "" }
}
