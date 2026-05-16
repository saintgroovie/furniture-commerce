/**
 * QA-only: preserve user-defined gallery order for legacy media board variants.
 */

export type GalleryOrderSource = "manual" | "seed" | "suggestion" | "auto" | "recommended" | "rules"

export type VariantGalleryOrderFields = {
  gallery: string[]
  primary: string | null
  galleryOrderSource?: GalleryOrderSource | null
  galleryOrderLocked?: boolean
  primaryManualOverride?: boolean
  primaryAutoPicked?: boolean
}

export function variantHasEstablishedGalleryOrder(
  variant: VariantGalleryOrderFields | null | undefined,
  metaStatus?: string | null
): boolean {
  if (!variant || variant.gallery.length === 0) return false
  if (variant.galleryOrderLocked) return true
  if (variant.galleryOrderSource === "manual" || variant.galleryOrderSource === "recommended") return true
  if (variant.primaryManualOverride) return true
  if (variant.galleryOrderSource === "seed" || variant.galleryOrderSource === "suggestion") return false
  if (metaStatus === "edited" || metaStatus === "confirmed") return true
  if (variant.gallery.length > 0 && !variant.primaryAutoPicked) return true
  return false
}

/** Keep user gallery order; append unseen candidate ids at the end (stable). */
export function mergeGalleryPreservingOrder(
  existingGallery: string[],
  candidateIds: string[],
  primary: string | null
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of existingGallery) {
    if (!id || id === primary || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  for (const id of candidateIds) {
    if (!id || id === primary || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function sortIdsByPreferredOrder(ids: string[], preferredOrder: string[]): string[] {
  if (!preferredOrder.length) return [...ids]
  const index = new Map(preferredOrder.map((id, i) => [id, i]))
  return [...ids].sort((a, b) => {
    const ia = index.get(a)
    const ib = index.get(b)
    if (ia == null && ib == null) return 0
    if (ia == null) return 1
    if (ib == null) return -1
    return ia - ib
  })
}

export function withManualGalleryOrder<T extends VariantGalleryOrderFields>(variant: T): T {
  return {
    ...variant,
    galleryOrderSource: "manual",
    galleryOrderLocked: true,
    primaryAutoPicked: false,
  }
}

export function withRecommendedGalleryOrder<T extends VariantGalleryOrderFields>(variant: T): T {
  return {
    ...variant,
    galleryOrderSource: "recommended",
    galleryOrderLocked: true,
    primaryAutoPicked: false,
    primaryManualOverride: false,
  }
}
