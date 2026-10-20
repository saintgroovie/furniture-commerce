/**
 * Browser-safe Provence paint×wood false-split guard (no `apps/backend` imports).
 * Keep in sync with apps/backend/src/lib/provence-paint-wood-finish-metadata.ts
 * and provence-pdf-catalog-contamination.ts.
 */

const PROVENCE_PDF_CATALOG_RE = /\/Provence_White_(?:p\d+_|page_\d+)/i

type ProvencePaintWoodBucket = "paint" | "wood"
type ProvencePaintWoodWorkbookProfile = "standard" | "three_gallery"

// Visually audited SKU-native photos (2026-10-20). The workbook fallback below
// needs duplicate gallery/i-file aliases as evidence. These exact photo sets
// retain both finishes after the aliases are removed; similar white-only shots
// must not become a second finish merely because their names contain i2/main.
const AUDITED_FINISH_PHOTOS: Record<string, { paint: string[]; wood: string[] }> = {
  "pv-05-2": { paint: ["i1", "i2"], wood: ["i3", "i4"] },
  "pv-06-2": { paint: ["i1", "i2"], wood: ["i3", "i4"] },
  "pv-08-2": { paint: ["i1", "i2"], wood: ["i3", "i4"] },
  "pv-09-1": { paint: ["i1", "i2"], wood: ["main"] },
  "pv-55-1": { paint: ["i1", "i2"], wood: ["i3", "i4"] },
  "pv-62-1": { paint: ["i1", "i2"], wood: ["i3", "i4"] },
  "pv-61-1": { paint: ["i1", "i2"], wood: ["i3", "i4"] },
  "pv-42-2": { paint: ["i1"], wood: ["gallery_02", "i3"] },
  "pv-65-8": { paint: ["i1"], wood: ["i2", "main"] },
}

function basename(url: string): string {
  return (url.split("/").pop() ?? url).toLowerCase()
}

function isProvencePdfCatalogExtractUrl(url: string): boolean {
  return PROVENCE_PDF_CATALOG_RE.test(url)
}

function isProvenceSkuNativeImageUrl(url: string, handle: string): boolean {
  if (isProvencePdfCatalogExtractUrl(url)) return false
  const h = handle.toLowerCase()
  if (!h.startsWith("pv-")) return false
  const b = basename(url)
  const core = h.slice(3).replace(/-/g, "[-_]")
  const anchored = new RegExp(`(?:^|[^a-z0-9])pv[-_]?${core}(?:[^a-z0-9]|$)`, "i")
  return anchored.test(b)
}

function filterProvenceSkuNativeUrls(urls: string[], handle: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const u of urls) {
    if (!isProvenceSkuNativeImageUrl(u, handle)) continue
    const key = basename(u)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(u)
  }
  return out
}

function provencePdfCatalogContaminationDetected(
  urls: string[],
  meta?: Record<string, unknown>
): boolean {
  if (urls.some(isProvencePdfCatalogExtractUrl)) return true
  const raw = meta?.paint_finish_executions ?? meta?.finish_color_executions
  if (!Array.isArray(raw)) return false
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    for (const u of (entry as { urls?: string[] }).urls ?? []) {
      if (isProvencePdfCatalogExtractUrl(u)) return true
    }
  }
  return false
}

function provencePaintWoodWorkbookProfile(
  urls: string[],
  handle?: string
): ProvencePaintWoodWorkbookProfile {
  const h = handle?.toLowerCase()
  if (!h?.startsWith("pv-")) return "standard"
  const names = urls.map(basename)
  const hasG03 = names.some((b) => /gallery[_\-.]?03(?:\.|[-_]|$)/i.test(b))
  const hasI3 = names.some((b) => /[-_]i0?3(?:\.|[-_]|$)/i.test(b))
  const hasI4 = names.some((b) => /[-_]i0?4(?:\.|[-_]|$)/i.test(b))
  if (hasG03 && (hasI3 || hasI4)) return "three_gallery"
  return "standard"
}

function provencePaintWoodBucketForUrl(
  url: string,
  profile: ProvencePaintWoodWorkbookProfile = "standard",
  handle?: string
): ProvencePaintWoodBucket | null {
  if (isProvencePdfCatalogExtractUrl(url)) return null
  if (handle && !isProvenceSkuNativeImageUrl(url, handle)) return null
  const hay = basename(url)
  if (profile === "three_gallery") {
    if (
      /gallery[_\-.]?0?1(?:\.|[-_]|$)|gallery[_\-.]?0?2(?:\.|[-_]|$)|gallery[_\-.]?0?3(?:\.|[-_]|$)|[-_]i0?1(?:\.|[-_]|$)|[-_]i0?2(?:\.|[-_]|$)/i.test(
        hay
      )
    ) {
      return "paint"
    }
    if (/[-_]main(?:\.|[-_]|$)|[-_]i0?3(?:\.|[-_]|$)|[-_]i0?4(?:\.|[-_]|$)/i.test(hay)) {
      return "wood"
    }
    return null
  }
  if (/gallery[_\-.]?01(?:\.|[-_]|$)|[-_]i0?1(?:\.|[-_]|$)/i.test(hay)) return "paint"
  if (
    /gallery[_\-.]?02(?:\.|[-_]|$)|[-_]i0?2(?:\.|[-_]|$)|[-_]i0?3(?:\.|[-_]|$)|[-_]main(?:\.|[-_]|$)/i.test(
      hay
    )
  ) {
    return "wood"
  }
  return null
}

export function provenceEvidenceHandle(product: {
  handle?: unknown
  metadata?: unknown
}): string {
  const meta = product.metadata
  const media =
    meta && typeof meta === "object" && !Array.isArray(meta)
      ? (meta as { media_identity_handle?: unknown }).media_identity_handle
      : undefined
  if (typeof media === "string" && media.trim().toLowerCase().startsWith("pv-")) {
    return media.trim().toLowerCase()
  }
  return typeof product.handle === "string" ? product.handle : ""
}

/** `i1` + `main` alone is scene-only — not paint×wood dual finish. */
export function hasProvencePaintWoodDualFinishEvidence(
  urls: string[],
  handle?: string
): boolean {
  const h = handle?.toLowerCase()
  if (!h?.startsWith("pv-")) return false
  if (provencePdfCatalogContaminationDetected(urls)) return false
  const native = filterProvenceSkuNativeUrls(urls, h)
  const audited = AUDITED_FINISH_PHOTOS[h]
  if (audited) {
    const names = new Set(native.map(basename))
    const has = (suffixes: string[]) => suffixes.some((suffix) =>
      names.has(`${h}${suffix.startsWith("i") ? "-" : "_"}${suffix}.jpg`)
    )
    return has(audited.paint) && has(audited.wood)
  }
  const profile = provencePaintWoodWorkbookProfile(native, handle)
  const names = native.map(basename)
  const paint = native.filter((u) => provencePaintWoodBucketForUrl(u, profile, h) === "paint")
  const wood = native.filter((u) => provencePaintWoodBucketForUrl(u, profile, h) === "wood")
  if (paint.length === 0 || wood.length === 0) return false

  const hasG01 = names.some((b) => /gallery[_\-.]?01(?:\.|[-_]|$)/i.test(b))
  const hasG02 = names.some((b) => /gallery[_\-.]?02(?:\.|[-_]|$)/i.test(b))
  const hasG03 = names.some((b) => /gallery[_\-.]?03(?:\.|[-_]|$)/i.test(b))
  const hasI1 = names.some((b) => /[-_]i0?1(?:\.|[-_]|$)/i.test(b))
  const hasI2 = names.some((b) => /[-_]i0?2(?:\.|[-_]|$)/i.test(b))
  const hasI3 = names.some((b) => /[-_]i0?3(?:\.|[-_]|$)/i.test(b))
  const hasI4 = names.some((b) => /[-_]i0?4(?:\.|[-_]|$)/i.test(b))

  if (profile === "three_gallery") {
    return hasG03 && (hasI3 || hasI4) && paint.length >= 2 && wood.length >= 1
  }

  if (profile === "standard") {
    if (!hasG02) return false
    if (paint.length === 0 || wood.length === 0) return false
    if (hasG01 && hasG02 && hasI1 && hasI2) return true
    if (hasG02 && hasI2) return true
    if (hasG01 && hasG02 && hasI1 && !hasI2) {
      const hasWoodMain = names.some((b) => /[-_]main(?:\.|[-_]|$)/i.test(b))
      if (hasI3 || hasI4 || hasWoodMain) return true
    }
    return false
  }

  return false
}
