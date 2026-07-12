/**
 * Media URL helpers — preserve pathname case (storage may be case-sensitive).
 */

export function toRelativeMediaPath(url: string): string {
  const t = (url ?? "").trim()
  if (!t) return ""
  if (t.startsWith("/")) return t.split(/[?#]/)[0] || t
  try {
    const u = new URL(t)
    if (
      u.pathname.startsWith("/static/") ||
      u.pathname.startsWith("/uploads/")
    ) {
      return u.pathname
    }
    return t
  } catch {
    return t
  }
}

/** Exact duplicate key: host-stripped path, case-preserving. */
export function mediaUrlIdentityKey(url: string): string {
  return toRelativeMediaPath(url) || url.trim()
}

export function displayMediaLabel(url: string): string {
  const path = toRelativeMediaPath(url) || url.trim()
  const base = path.split("/").pop() || path
  return base.length > 48 ? `${base.slice(0, 45)}…` : base
}

export function guessFormatFromUrl(url: string): string {
  const base = (toRelativeMediaPath(url) || url).split("?")[0].toLowerCase()
  const m = base.match(/\.([a-z0-9]+)$/)
  return m ? m[1] : "unknown"
}
