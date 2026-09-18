/**
 * Storefront vs Medusa Admin origin split.
 *
 * Buyer host must never serve Admin HTML. `/app` on the storefront is a
 * mistaken operator URL (Next 404 looks like a dead site). Redirect the
 * browser to the public Medusa origin so cookies/CORS stay same-origin on
 * Admin. Do not Traefik-mount Admin on the buyer hostname.
 *
 * Browser target is `NEXT_PUBLIC_MEDUSA_BACKEND_URL` only - never Docker
 * internal `http://backend:9000`.
 */

export function isMedusaAdminStorefrontPath(pathname: string): boolean {
  const p = pathname.split("?")[0] || ""
  return p === "/app" || p.startsWith("/app/")
}

function tryUrl(raw: string): URL | null {
  const trimmed = String(raw ?? "").trim()
  if (!trimmed) return null
  try {
    return new URL(trimmed)
  } catch {
    return null
  }
}

/** Loopback Admin Vite/login expects `localhost`, not `127.0.0.1`. */
export function canonicalizeAdminOrigin(origin: URL): URL {
  const next = new URL(origin.toString())
  if (next.hostname === "127.0.0.1") {
    next.hostname = "localhost"
  }
  return next
}

export function isBrowserSafeAdminOrigin(origin: URL): boolean {
  if (origin.protocol !== "http:" && origin.protocol !== "https:") return false
  const host = origin.hostname.toLowerCase()
  if (host === "backend" || host === "medusa") return false
  if (host.endsWith(".internal")) return false
  return true
}

function originKey(u: URL): string {
  return `${u.protocol}//${u.hostname}:${u.port || (u.protocol === "https:" ? "443" : "80")}`.toLowerCase()
}

export function resolveAdminAppRedirectUrl(opts: {
  pathname: string
  search?: string
  siteOrigin: string
  adminOrigin: string
}): string | null {
  if (!isMedusaAdminStorefrontPath(opts.pathname)) return null

  const adminRaw = tryUrl(opts.adminOrigin)
  if (!adminRaw) return null
  const admin = canonicalizeAdminOrigin(adminRaw)
  if (!isBrowserSafeAdminOrigin(admin)) return null

  const siteRaw = tryUrl(opts.siteOrigin)
  if (siteRaw && originKey(canonicalizeAdminOrigin(siteRaw)) === originKey(admin)) {
    return null
  }

  const path = opts.pathname.startsWith("/") ? opts.pathname : `/${opts.pathname}`
  const search = opts.search && opts.search !== "?" ? opts.search : ""
  return `${admin.origin}${path}${search}`
}
