/**
 * Same-origin URL for canvas swatch sampling (avoids CORS taint on Medusa static).
 * Display URLs stay on the backend; only hidden sampler loads via rewrite.
 */
export function toSameOriginSampleUrl(imageUrl: string): string {
  const trimmed = imageUrl.trim()
  if (!trimmed) return trimmed

  try {
    const u = new URL(trimmed, "http://localhost")
    const staticIdx = u.pathname.indexOf("/static/")
    if (staticIdx >= 0) {
      return `/product-static${u.pathname.slice(staticIdx + "/static".length)}`
    }
  } catch {
    const m = trimmed.match(/\/static\/(.+)$/)
    if (m?.[1]) return `/product-static/${m[1]}`
  }

  return trimmed
}
