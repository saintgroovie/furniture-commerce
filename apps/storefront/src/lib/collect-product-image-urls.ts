/**
 * Client-safe product image URL collector (no `apps/backend` imports).
 */

function basenameKey(url: string): string {
  return (url.split("/").pop() ?? url).toLowerCase()
}

function normalizeImageEntryUrl(entry: unknown): string | null {
  if (entry == null) return null
  if (typeof entry === "string") {
    const s = entry.trim()
    return s.length > 0 ? s : null
  }
  if (typeof entry !== "object") return null
  const o = entry as Record<string, unknown>
  const direct = o.url ?? o.URL ?? o.src
  if (typeof direct === "string" && direct.trim()) return direct.trim()
  return null
}

/** Thumbnail first, then `images[].url`, deduped by basename (raw API strings). */
export function collectProductImageUrls(product: Record<string, unknown>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (u: string) => {
    const key = basenameKey(u)
    if (seen.has(key)) return
    seen.add(key)
    out.push(u)
  }
  const thumb = product.thumbnail
  if (typeof thumb === "string" && thumb.trim()) push(thumb.trim())
  const raw = product.images
  const list: unknown[] = Array.isArray(raw) ? raw : []
  for (const entry of list) {
    const u = normalizeImageEntryUrl(entry)
    if (u) push(u)
  }
  return out
}
