/**
 * Provence workbook: painted white (gallery_01 + i1) vs dark lacquered wood (gallery_02 + i2 + tail).
 * Legacy assign prefill often merged both into a single `cream` variant.
 */
import {
  sortUrlsByBuyerPolicy,
  type ColorExecution,
} from "./gallery-buyer-sort"
import {
  filterProvenceSkuNativeUrls,
  isProvencePdfCatalogExtractUrl,
  isProvenceSkuNativeImageUrl,
  provencePdfCatalogContaminationDetected,
} from "./provence-pdf-catalog-contamination"

export type ProvencePaintWoodBucket = "paint" | "wood"

export type ProvencePaintWoodWorkbookProfile = "standard" | "three_gallery"

export type ProvencePaintWoodBundle = {
  executions: ColorExecution[]
  finish_color_labels: Record<string, string>
  defaultKey: string
  galleryUrls: string[]
  thumbnail: string
}

function basename(url: string): string {
  return (url.split("/").pop() ?? url).toLowerCase()
}

/** three_gallery paint PDP carousel: board strip g03 → i2 → i1 → g02 (TH g01 excluded — product.thumbnail only). */
export function threeGalleryPaintCarouselUrls(urls: string[]): string[] {
  const patterns = [
    /gallery[_\-.]?03(?:\.|[-_]|$)/i,
    /[-_]i0?2(?:\.|[-_]|$)/i,
    /[-_]i0?1(?:\.|[-_]|$)/i,
    /gallery[_\-.]?02(?:\.|[-_]|$)/i,
  ]
  const used = new Set<string>()
  const out: string[] = []
  for (const re of patterns) {
    const hit = urls.find((u) => re.test(basename(u)) && !used.has(u))
    if (hit) {
      out.push(hit)
      used.add(hit)
    }
  }
  for (const u of urls) {
    if (used.has(u)) continue
    if (/gallery[_\-.]?01(?:\.|[-_]|$)/i.test(basename(u))) continue
    out.push(u)
    used.add(u)
  }
  return out
}

export function threeGalleryPaintThumbnailUrl(urls: string[]): string | null {
  return (
    urls.find((u) => /gallery[_\-.]?01(?:\.|[-_]|$)/i.test(basename(u))) ??
    urls[0] ??
    null
  )
}

/** three_gallery paint: strip order for PDP; TH g01 is catalog thumb only. */
function rankThreeGalleryPaintUrl(url: string): number {
  const b = basename(url)
  if (/gallery[_\-.]?03(?:\.|[-_]|$)/i.test(b)) return 10
  if (/[-_]i0?2(?:\.|[-_]|$)/i.test(b)) return 20
  if (/[-_]i0?1(?:\.|[-_]|$)/i.test(b)) return 30
  if (/gallery[_\-.]?02(?:\.|[-_]|$)/i.test(b)) return 40
  if (/gallery[_\-.]?01(?:\.|[-_]|$)/i.test(b)) return 90
  return 99
}

function rankThreeGalleryWoodUrl(url: string): number {
  const b = basename(url)
  if (/[-_]main(?:\.|[-_]|$)/i.test(b)) return 10
  if (/[-_]i0?3(?:\.|[-_]|$)/i.test(b)) return 20
  if (/[-_]i0?4(?:\.|[-_]|$)/i.test(b)) return 30
  return 99
}

function sortProvenceBucketUrls(
  urls: string[],
  handle: string,
  profile: ProvencePaintWoodWorkbookProfile,
  bucket: ProvencePaintWoodBucket
): string[] {
  if (profile === "three_gallery" && bucket === "paint") {
    return [...urls].sort((a, b) => {
      const ra = rankThreeGalleryPaintUrl(a)
      const rb = rankThreeGalleryPaintUrl(b)
      if (ra !== rb) return ra - rb
      return urls.indexOf(a) - urls.indexOf(b)
    })
  }
  if (profile === "three_gallery" && bucket === "wood") {
    return [...urls].sort((a, b) => {
      const ra = rankThreeGalleryWoodUrl(a)
      const rb = rankThreeGalleryWoodUrl(b)
      if (ra !== rb) return ra - rb
      return urls.indexOf(a) - urls.indexOf(b)
    })
  }
  if (bucket === "paint" && profile === "standard") {
    return [...urls].sort((a, b) => {
      const rank = (u: string) => {
        const hay = basename(u)
        if (/gallery[_\-.]?01/i.test(hay)) return 10
        if (/[-_]i0?1/i.test(hay)) return 20
        return 99
      }
      return rank(a) - rank(b) || urls.indexOf(a) - urls.indexOf(b)
    })
  }
  return sortUrlsByBuyerPolicy(urls, { handle })
}

/** Detect broken three_gallery cream carousel (g01 hero or lift not last). */
export function isProvenceThreeGalleryPaintOrderBroken(urls: string[]): boolean {
  const bases = urls.map(basename)
  if (bases.length < 2) return false
  const g02 = bases.findIndex((b) => /gallery[_\-.]?02/.test(b))
  const g01 = bases.findIndex((b) => /gallery[_\-.]?01/.test(b))
  const g03 = bases.findIndex((b) => /gallery[_\-.]?03/.test(b))
  if (g01 === 0) return true
  if (g02 >= 0 && g02 !== bases.length - 1) return true
  if (g03 > 0 && g03 !== 0) return true
  const expected = threeGalleryPaintCarouselUrls(urls).map(basename).join("|")
  return bases.join("|") !== expected
}

function absToRelativeStatic(url: string): string {
  const m = url.match(/(\/static\/products\/[^\s?#]+)/i)
  return m ? m[1]! : url
}

/** `gallery_03` + `i3`/`i4` workbooks: paint uses g01–g03 + i1–i2; wood uses main + i3 + i4. */
export function provencePaintWoodWorkbookProfile(
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

/** Slot convention for pv-* paint vs lacquered-wood dual finish workbooks. */
export function provencePaintWoodBucketForUrl(
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

/**
 * Filename slots alone are not enough: `i1` (paint) + `main` (wood) is a common
 * single-finish hero + lift pair and must not become «Молочный» / «Тёмное дерево».
 */
export function hasProvencePaintWoodDualFinishEvidence(
  urls: string[],
  handle?: string
): boolean {
  const h = handle?.toLowerCase()
  if (!h?.startsWith("pv-")) return false
  if (provencePdfCatalogContaminationDetected(urls)) return false
  const native = filterProvenceSkuNativeUrls(urls, h)
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

  // Standard workbook: dark-wood finish is anchored on gallery_02. Without it, g01+i1+i2+main
  // is a single-finish multi-angle set (e.g. pv-66-7), not paint×wood.
  if (!hasG02) return false
  if (hasG01 && hasG02 && hasI1 && hasI2) return true
  if (hasG02 && hasI2) return true

  return false
}

export function isProvencePaintWoodDualFinishCandidate(
  urls: string[],
  handle?: string
): boolean {
  return hasProvencePaintWoodDualFinishEvidence(urls, handle)
}

/** Metadata tagged or inferred as paint×wood but filenames lack dual-finish workbook proof. */
export function isProvenceFalsePaintWoodSplitMetadata(
  meta: Record<string, unknown>,
  urls: string[],
  handle: string
): boolean {
  if (!hasProvencePaintWoodFinishMetadata(meta)) return false
  const native = filterProvenceSkuNativeUrls(urls, handle)
  if (provencePdfCatalogContaminationDetected(urls, meta)) return true
  return !hasProvencePaintWoodDualFinishEvidence(native, handle)
}

/** Remove invented cream/wood rows; caller should scene-only migrate or flat gallery after. */
export function clearProvenceFalsePaintWoodSplitFromMeta(
  meta: Record<string, unknown>
): boolean {
  if (!hasProvencePaintWoodFinishMetadata(meta)) return false
  meta.finish_color_executions = null
  meta.finish_color_labels = null
  meta.paint_finish_executions = null
  meta.paint_finish_labels = null
  meta.finish_metadata_source = null
  meta.execution_dimension_contract = null
  return true
}

export function hasProvencePaintWoodFinishMetadata(meta: Record<string, unknown>): boolean {
  const raw = meta.finish_color_executions ?? meta.paint_finish_executions
  if (!Array.isArray(raw) || raw.length < 2) return false
  const keys = new Set(
    raw
      .map((e) => (e && typeof e === "object" ? (e as { key?: string }).key : null))
      .filter((k): k is string => Boolean(k))
  )
  return keys.has("cream") && keys.has("wood")
}

function collectUrlsForBucket(
  urls: string[],
  bucket: ProvencePaintWoodBucket,
  handle: string,
  profile: ProvencePaintWoodWorkbookProfile
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const url of urls) {
    if (provencePaintWoodBucketForUrl(url, profile, handle) !== bucket) continue
    const rel = absToRelativeStatic(url)
    if (seen.has(rel)) continue
    seen.add(rel)
    out.push(url)
  }
  return sortProvenceBucketUrls(out, handle, profile, bucket)
}

export function buildProvencePaintWoodFinishBundle(
  urls: string[],
  handle: string
): ProvencePaintWoodBundle | null {
  const native = filterProvenceSkuNativeUrls(urls, handle)
  if (!isProvencePaintWoodDualFinishCandidate(native, handle)) return null

  const profile = provencePaintWoodWorkbookProfile(native, handle)
  const paintAll = collectUrlsForBucket(native, "paint", handle, profile)
  const woodUrls = collectUrlsForBucket(native, "wood", handle, profile)
  if (paintAll.length === 0 || woodUrls.length === 0) return null

  const paintCarousel =
    profile === "three_gallery"
      ? threeGalleryPaintCarouselUrls(paintAll)
      : paintAll
  const thumbAbs =
    profile === "three_gallery"
      ? threeGalleryPaintThumbnailUrl(paintAll) ?? paintCarousel[0]!
      : paintAll[0]!

  const executions: ColorExecution[] = [
    {
      key: "cream",
      label: "Молочный",
      urls: paintCarousel.map(absToRelativeStatic),
    },
    {
      key: "wood",
      label: "Тёмное дерево",
      urls: woodUrls.map(absToRelativeStatic),
    },
  ]

  // Bucket URLs are already ordered by Provence workbook rules — do not re-sort via buyer policy.
  const sorted = executions
  const sharedTailUrls: string[] = []
  const defaultKey = "cream"
  const defaultExec = sorted.find((e) => e.key === defaultKey) ?? sorted[0]!
  const galleryUrls = defaultExec.urls
  const thumbnail = absToRelativeStatic(thumbAbs)

  const finish_color_labels: Record<string, string> = {}
  for (const ex of sorted) finish_color_labels[ex.key] = ex.label

  return {
    executions: sorted,
    finish_color_labels,
    defaultKey,
    galleryUrls,
    thumbnail,
  }
}

/** True when shared_scene_media repeats URLs already assigned to finish_color_executions. */
export function provencePaintWoodSharedSceneOverlapsExecutions(
  meta: Record<string, unknown>
): boolean {
  const shared = meta.shared_scene_media
  if (!Array.isArray(shared) || shared.length === 0) return false
  const assigned = new Set<string>()
  const raw = meta.finish_color_executions ?? meta.paint_finish_executions
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue
      for (const u of (entry as { urls?: string[] }).urls ?? []) {
        assigned.add(basename(u))
      }
    }
  }
  for (const group of shared) {
    if (!group || typeof group !== "object") continue
    for (const u of (group as { urls?: string[] }).urls ?? []) {
      if (assigned.has(basename(u))) return true
    }
  }
  return false
}

/** True when finish metadata used standard slots on a three-gallery workbook (white paint leaked into wood). */
export function provencePaintWoodFinishMetadataNeedsRepair(
  meta: Record<string, unknown>,
  urls: string[],
  handle: string
): boolean {
  if (provencePaintWoodSharedSceneOverlapsExecutions(meta)) return true
  if (
    hasProvencePaintWoodFinishMetadata(meta) &&
    meta.finish_metadata_source !== "provence_paint_wood_split"
  ) {
    return true
  }
  if (provencePaintWoodWorkbookProfile(urls, handle) !== "three_gallery") return false
  const raw = meta.finish_color_executions ?? meta.paint_finish_executions
  if (!Array.isArray(raw)) return true
  const cream = raw.find(
    (e) => e && typeof e === "object" && (e as { key?: string }).key === "cream"
  ) as { urls?: string[] } | undefined
  const creamUrls = cream?.urls ?? []
  if (creamUrls.length > 0 && isProvenceThreeGalleryPaintOrderBroken(creamUrls)) return true
  const wood = raw.find(
    (e) => e && typeof e === "object" && (e as { key?: string }).key === "wood"
  ) as { urls?: string[] } | undefined
  const woodNames = (wood?.urls ?? []).map(basename)
  return woodNames.some(
    (b) =>
      /gallery[_\-.]?02/i.test(b) ||
      /[-_]i0?2(?:\.|[-_]|$)/i.test(b)
  )
}

/** Apply paint×wood split onto product metadata; returns bundle when changed. */
export function applyProvencePaintWoodFinishToMeta(
  meta: Record<string, unknown>,
  urls: string[],
  handle: string,
  opts?: { forceRepair?: boolean }
): { changed: boolean; bundle: ProvencePaintWoodBundle | null } {
  const bundle = buildProvencePaintWoodFinishBundle(urls, handle)
  if (!bundle) return { changed: false, bundle: null }

  const needsRepair = opts?.forceRepair === true || provencePaintWoodFinishMetadataNeedsRepair(meta, urls, handle)

  if (hasProvencePaintWoodFinishMetadata(meta) && !needsRepair) {
    const existing = meta.finish_color_executions as ColorExecution[]
    const sameKeys =
      Array.isArray(existing) &&
      existing.length === bundle.executions.length &&
      bundle.executions.every((ex) => {
        const prev = existing.find((e) => e.key === ex.key)
        if (!prev) return false
      const prevBases = (prev.urls ?? []).map((u) => basename(u))
      const nextBases = ex.urls.map((u) => basename(u))
      if (prevBases.join("|") !== nextBases.join("|")) return false
        return prev.label === ex.label
      })
    if (sameKeys) return { changed: false, bundle }
  }

  meta.finish_color_executions = bundle.executions
  meta.finish_color_labels = bundle.finish_color_labels
  meta.finish_metadata_source = "provence_paint_wood_split"
  meta.shared_scene_media = null
  meta.execution_dimension_contract = "paint_finish|finish_color_executions"
  return { changed: true, bundle }
}
