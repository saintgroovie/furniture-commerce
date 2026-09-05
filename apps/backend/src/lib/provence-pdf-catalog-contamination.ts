/**
 * Provence PDF catalog page extracts (`Provence_White_p##_i*.png`, `Provence_White_page_*.png`)
 * are collection-wide crops and must not attach to individual `pv-*` SKU galleries.
 */

const PROVENCE_PDF_CATALOG_RE =
  /\/Provence_White_(?:p\d+_|page_\d+)/i

export function isProvencePdfCatalogExtractUrl(url: string): boolean {
  return PROVENCE_PDF_CATALOG_RE.test(url)
}

export function provenceHandleToSkuCode(handle: string): string | null {
  const h = handle.toLowerCase()
  if (!/^pv-\d/.test(h)) return null
  return `PV-${h.slice(3).toUpperCase()}`
}

/** True when basename belongs to this SKU (not shared PDF catalog crops). */
export function isProvenceSkuNativeImageUrl(url: string, handle: string): boolean {
  if (isProvencePdfCatalogExtractUrl(url)) return false
  const h = handle.toLowerCase()
  if (!h.startsWith("pv-")) return false
  const b = (url.split("/").pop() ?? url).toLowerCase()
  const core = h.slice(3).replace(/-/g, "[-_]")
  const anchored = new RegExp(`(?:^|[^a-z0-9])pv[-_]?${core}(?:[^a-z0-9]|$)`, "i")
  return anchored.test(b)
}

export function filterProvenceSkuNativeUrls(urls: string[], handle: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const u of urls) {
    if (!isProvenceSkuNativeImageUrl(u, handle)) continue
    const key = (u.split("/").pop() ?? u).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(u)
  }
  return out
}

/** Buyer-facing pair for single-finish wardrobes: анфас + 3/4 when both gallery slots exist. */
export function provenceSingleFinishGalleryUrls(urls: string[], handle: string): string[] {
  const native = filterProvenceSkuNativeUrls(urls, handle)
  const g01 = native.find((u) => /gallery[_\-.]?01(?:\.|[-_]|$)/i.test(u))
  const g02 = native.find((u) => /gallery[_\-.]?02(?:\.|[-_]|$)/i.test(u))
  if (g01 && g02) return [g01, g02]
  if (native.length <= 2) return native
  return native
}

/**
 * Scene-only `pv-*` with interior `i1` + catalog `main` and no gallery slots — keep `i1` only.
 * Prevents PDP duplicate thumbs (lesson P8 / pv-55-2).
 */
export function provenceSceneOnlyCanonicalGalleryUrls(urls: string[], handle: string): string[] {
  const native = filterProvenceSkuNativeUrls(urls, handle)
  const names = native.map((u) => (u.split("/").pop() ?? u).toLowerCase())
  const hasGallery = names.some((b) => /gallery[_\-.]?\d+/i.test(b))
  if (hasGallery) return provenceSingleFinishGalleryUrls(urls, handle)

  const i1 = native.find((u) => /[-_]i0?1(?:\.|[-_]|$)/i.test(u))
  const main = native.find((u) => /[-_]main(?:\.|[-_]|$)/i.test(u))
  if (i1 && main && native.length === 2) return [i1]

  return provenceSingleFinishGalleryUrls(urls, handle)
}

export function provencePdfCatalogContaminationDetected(
  urls: string[],
  meta?: Record<string, unknown>
): boolean {
  if (urls.some(isProvencePdfCatalogExtractUrl)) return true
  const raw = meta?.paint_finish_executions ?? meta?.finish_color_executions
  if (!Array.isArray(raw)) return false
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const o = entry as { key?: string; urls?: string[] }
    const urls = o.urls ?? []
    if (urls.some(isProvencePdfCatalogExtractUrl)) return true
  }
  return false
}

export function provencePdfCatalogContaminationNeedsRepair(
  handle: string,
  imageUrls: string[],
  meta?: Record<string, unknown>
): boolean {
  if (!handle.toLowerCase().startsWith("pv-")) return false
  return provencePdfCatalogContaminationDetected(imageUrls, meta)
}
