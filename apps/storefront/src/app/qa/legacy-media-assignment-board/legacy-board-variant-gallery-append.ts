/**
 * QA-only: append one media id to the end of every color variant gallery for a handle.
 */

import { DEFAULT_VARIANT_KEY } from "./legacy-color-variant-labels"
import { withManualGalleryOrder, type VariantGalleryOrderFields } from "./legacy-variant-gallery-order"

export type VariantDecisionSlots = VariantGalleryOrderFields & {
  label: string
  reference?: string[]
  rejected?: string[]
}

export type AppendGallerySkipReason = "is_primary" | "already_in_gallery" | "not_color_variant"

export type AppendToAllGalleriesResult = {
  changed: boolean
  added: Array<{ variantKey: string; label: string }>
  already: Array<{ variantKey: string; reason: AppendGallerySkipReason }>
  skipped: Array<{ variantKey: string; reason: string }>
  nextVariants: Record<string, VariantDecisionSlots>
}

/** Color variants eligible for bulk gallery append (existing state only). */
export function isBulkGalleryVariantKey(variantKey: string): boolean {
  if (!variantKey || variantKey === DEFAULT_VARIANT_KEY) return false
  if (variantKey.includes("needs_review")) return false
  if (variantKey.endsWith("__review")) return false
  return variantKey.startsWith("color_")
}

/** Confirmed color variants with at least primary or one gallery image. */
export function countBulkGalleryVariants(variants: Record<string, VariantDecisionSlots> | undefined): number {
  if (!variants) return 0
  return Object.entries(variants).filter(
    ([vk, v]) => isBulkGalleryVariantKey(vk) && (Boolean(v.primary) || v.gallery.length > 0)
  ).length
}

function slotsEqual(a: VariantDecisionSlots, b: VariantDecisionSlots): boolean {
  if (a.primary !== b.primary) return false
  if (a.gallery.length !== b.gallery.length) return false
  return a.gallery.every((id, i) => id === b.gallery[i])
}

/**
 * Append media to gallery tail of each color variant; preserve manual order flags.
 */
export function appendMediaToAllVariantGalleries(
  variants: Record<string, VariantDecisionSlots>,
  mediaId: string
): AppendToAllGalleriesResult {
  const nextVariants: Record<string, VariantDecisionSlots> = { ...variants }
  const added: AppendToAllGalleriesResult["added"] = []
  const already: AppendToAllGalleriesResult["already"] = []
  const skipped: AppendToAllGalleriesResult["skipped"] = []

  const eligible = Object.entries(variants).filter(([vk]) => isBulkGalleryVariantKey(vk))
  if (eligible.length === 0) {
    return { changed: false, added, already, skipped, nextVariants: variants }
  }

  for (const [variantKey, variant] of eligible) {
    if (variant.primary === mediaId) {
      already.push({ variantKey, reason: "is_primary" })
      continue
    }
    if (variant.gallery.includes(mediaId)) {
      already.push({ variantKey, reason: "already_in_gallery" })
      continue
    }
    const nextVariant = withManualGalleryOrder({
      ...variant,
      gallery: [...variant.gallery, mediaId],
    })
    if (slotsEqual(variant, nextVariant)) continue
    nextVariants[variantKey] = nextVariant
    added.push({ variantKey, label: variant.label })
  }

  return {
    changed: added.length > 0,
    added,
    already,
    skipped,
    nextVariants,
  }
}

export function formatAppendToAllGalleriesNote(result: AppendToAllGalleriesResult): string {
  if (result.added.length === 0 && result.already.length === 0) {
    return "Нет подтверждённых цветов для массового добавления"
  }
  const parts = [`Добавлено: ${result.added.length}`]
  if (result.already.length > 0) parts.push(`Уже было: ${result.already.length}`)
  return parts.join(" · ")
}
