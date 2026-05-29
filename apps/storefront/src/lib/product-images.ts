/**
 * Storefront helpers for listing/API-shaped product media URLs.
 * Used by diagnostics and optional call sites — does not rewrite URLs.
 *
 * Catalog cards: hero uses `product.thumbnail` only; extras use
 * {@link collectExtraProductImageUrls}, {@link collectDisplayGroupExtraImageUrls}, and
 * {@link mergeUniqueExtraUrls} (listing attaches `display_group_extra_image_urls` in `display-group.ts`).
 */

/**
 * Drops obvious non-image garbage before UI / collect paths.
 * Does **not** strip `/uploads/` or `/static/` — those may work behind proxy; broken ones are pruned client-side after load.
 */
export function filterObviousGarbageImageUrl(s: string): string | null {
  const t = typeof s === "string" ? s.trim() : ""
  if (t.length < 2) return null
  const lower = t.toLowerCase()
  if (lower === "undefined" || lower === "null" || lower === "[object object]") return null
  if (/^\s*(javascript|vbscript|data:text\/html):/i.test(t)) return null
  const ok =
    t.startsWith("http://") ||
    t.startsWith("https://") ||
    t.startsWith("/") ||
    t.startsWith("data:image/")
  if (!ok) return null
  return t
}

export function normalizeImageEntryUrl(entry: unknown): string | null {
  if (entry == null) return null
  if (typeof entry === "string") {
    const s = entry.trim()
    return s.length > 0 ? s : null
  }
  if (typeof entry !== "object") return null
  const o = entry as Record<string, unknown>
  const direct = o.url ?? o.URL ?? o.src
  if (typeof direct === "string" && direct.trim()) return direct.trim()
  const file = o.file
  if (file && typeof file === "object") {
    const fu = (file as Record<string, unknown>).url
    if (typeof fu === "string" && fu.trim()) return fu.trim()
  }
  return null
}

/**
 * URLs from `product.images` only, for catalog card extras (not hero).
 * Omits empty/invalid entries, trims, dedupes, excludes `mainSrc` (canonical thumbnail).
 */
export function collectExtraProductImageUrls(
  product: Record<string, unknown>,
  mainSrc: string
): string[] {
  const mainNorm = typeof mainSrc === "string" ? mainSrc.trim() : ""
  const out: string[] = []
  const raw = product.images
  const list: unknown[] = Array.isArray(raw) ? raw : []
  for (const entry of list) {
    const u = normalizeImageEntryUrl(entry)
    const v = u ? filterObviousGarbageImageUrl(u) : null
    if (!v) continue
    if (mainNorm.length > 0 && v === mainNorm) continue
    if (!out.includes(v)) out.push(v)
  }
  return out
}

/**
 * UI-only extras from a display group: every member's `images[]`, plus each
 * `thumbnail` that differs from `mainSrc` (typically the representative / PDP hero thumbnail).
 * Does not rewrite URLs; omits empty, dedupes, never returns `mainSrc`.
 */
export function collectDisplayGroupExtraImageUrls(
  members: Record<string, unknown>[],
  mainSrc: string
): string[] {
  const mainNorm = typeof mainSrc === "string" ? mainSrc.trim() : ""
  const out: string[] = []
  for (const m of members) {
    const raw = m.images
    const list: unknown[] = Array.isArray(raw) ? raw : []
    for (const entry of list) {
      const u = normalizeImageEntryUrl(entry)
      const v = u ? filterObviousGarbageImageUrl(u) : null
      if (!v) continue
      if (mainNorm.length > 0 && v === mainNorm) continue
      if (!out.includes(v)) out.push(v)
    }
    const thumb = m.thumbnail
    if (typeof thumb === "string") {
      const s0 = thumb.trim()
      const s = filterObviousGarbageImageUrl(s0)
      if (!s) continue
      if (mainNorm.length > 0 && s === mainNorm) continue
      if (!out.includes(s)) out.push(s)
    }
  }
  return out
}

/** Merge ordered URL lists for card/PDP extras; trims, dedupes, excludes `mainSrc`. */
export function mergeUniqueExtraUrls(mainSrc: string, segments: string[][]): string[] {
  const mainNorm = typeof mainSrc === "string" ? mainSrc.trim() : ""
  const out: string[] = []
  for (const seg of segments) {
    for (const u of seg) {
      if (typeof u !== "string") continue
      const s = filterObviousGarbageImageUrl(u)
      if (!s) continue
      if (mainNorm.length > 0 && s === mainNorm) continue
      if (!out.includes(s)) out.push(s)
    }
  }
  return out
}

/** Thumbnail first, then `images[].url`, deduped (raw API strings). */
export function collectProductImageUrls(product: Record<string, unknown>): string[] {
  const urls: string[] = []
  const thumb = product.thumbnail
  if (typeof thumb === "string" && thumb.trim()) urls.push(thumb.trim())
  const raw = product.images
  const list: unknown[] = Array.isArray(raw) ? raw : []
  for (const entry of list) {
    const u = normalizeImageEntryUrl(entry)
    if (u && !urls.includes(u)) urls.push(u)
  }
  return urls
}

/** Alias for diagnostics (same as {@link collectProductImageUrls} after rollback). */
export function gatherRawProductImageUrls(product: Record<string, unknown>): string[] {
  return collectProductImageUrls(product)
}

export function mergeProductImageUrlsFromMembers(
  members: Record<string, unknown>[]
): string[] {
  const out: string[] = []
  for (const m of members) {
    for (const u of collectProductImageUrls(m)) {
      if (u && !out.includes(u)) out.push(u)
    }
  }
  return out
}
