/** Shared Oliver static URL helpers (no guard / fabric-from-media imports). */

export function normalizeOliverFabricKey(token: string): string {
  const t = token.toLowerCase()
  return t === "lilian" ? "lillian" : t
}

/** Extract `/static/products/...` path; legacy Oliver filenames may contain spaces. */
export function extractStaticProductPath(url: string): string {
  const trimmed = url.trim()
  const idx = trimmed.search(/\/static\/products\//i)
  if (idx < 0) return trimmed
  const tail = trimmed.slice(idx)
  const q = tail.search(/[?#]/)
  return q >= 0 ? tail.slice(0, q) : tail
}
