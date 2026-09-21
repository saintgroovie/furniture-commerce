/**
 * Next `redirects()` helper for /app → public Medusa origin.
 * Keep in sync with admin-app-boundary.ts (same hostname / same-origin rules).
 * CommonJS so next.config.js can require it without compiling TS.
 */

function tryUrl(raw) {
  const trimmed = String(raw ?? "").trim()
  if (!trimmed) return null
  try {
    return new URL(trimmed)
  } catch {
    return null
  }
}

function canonicalizeAdminOrigin(origin) {
  const next = new URL(origin.toString())
  if (next.hostname === "127.0.0.1") next.hostname = "localhost"
  return next
}

function isBrowserSafeAdminOrigin(origin) {
  if (origin.protocol !== "http:" && origin.protocol !== "https:") return false
  const host = origin.hostname.toLowerCase()
  if (host === "backend" || host === "medusa") return false
  if (host.endsWith(".internal")) return false
  return true
}

function originKey(u) {
  const port = u.port || (u.protocol === "https:" ? "443" : "80")
  return `${u.protocol}//${u.hostname}:${port}`.toLowerCase()
}

function adminAppRedirects(env) {
  const adminRaw = String((env || process.env).NEXT_PUBLIC_MEDUSA_BACKEND_URL || "")
    .trim()
    .replace(/\/$/, "")
  const siteRaw = String((env || process.env).NEXT_PUBLIC_SITE_URL || "")
    .trim()
    .replace(/\/$/, "")
  const adminUrl = tryUrl(adminRaw)
  if (!adminUrl) return []
  const admin = canonicalizeAdminOrigin(adminUrl)
  if (!isBrowserSafeAdminOrigin(admin)) return []
  const siteUrl = tryUrl(siteRaw)
  if (siteUrl && originKey(canonicalizeAdminOrigin(siteUrl)) === originKey(admin)) {
    return []
  }
  const dest = admin.origin
  return [
    { source: "/app", destination: `${dest}/app`, permanent: true },
    { source: "/app/:path*", destination: `${dest}/app/:path*`, permanent: true },
  ]
}

module.exports = {
  adminAppRedirects,
  canonicalizeAdminOrigin,
  isBrowserSafeAdminOrigin,
  originKey,
}
