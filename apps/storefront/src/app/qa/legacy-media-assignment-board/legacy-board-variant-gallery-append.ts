/**
 * QA-only: append one media id to the end of every color variant gallery for a handle.
 *
 * "All colors" = every `color_*` variant for the current SKU from:
 * - existing `variantsByHandle[handle]` entries, and
 * - safe `this_sku` suggestions (materialized as empty shells when missing).
 *
 * Does not require confirmed status or existing gallery content.
 * Reference/rejected: media is removed from those lanes and appended to gallery (per-variant).
 */

import { DEFAULT_VARIANT_KEY } from "./legacy-color-variant-labels"
import { withManualGalleryOrder, type VariantGalleryOrderFields } from "./legacy-variant-gallery-order"

export type VariantDecisionSlots = VariantGalleryOrderFields & {
  label: string
  reference?: string[]
  rejected?: string[]
}

export type BulkAppendSuggestion = {
  variantKey: string
  label: string
  identityTier: string
}

export type AppendGallerySkipReason = "is_primary" | "already_in_gallery" | "not_color_variant"

export type AppendToAllGalleriesResult = {
  changed: boolean
  added: Array<{ variantKey: string; label: string }>
  already: Array<{ variantKey: string; reason: AppendGallerySkipReason }>
  skipped: Array<{ variantKey: string; reason: string }>
  nextVariants: Record<string, VariantDecisionSlots>
  /** Variant keys targeted by this operation (for diagnostics). */
  targetVariantKeys: string[]
}

/** Color variants eligible for bulk gallery append. */
export function isBulkGalleryVariantKey(variantKey: string): boolean {
  if (!variantKey || variantKey === DEFAULT_VARIANT_KEY) return false
  if (variantKey.includes("needs_review")) return false
  if (variantKey.endsWith("__review")) return false
  return variantKey.startsWith("color_")
}

/**
 * Merge existing variants with safe this_sku suggestions; materialize missing color shells.
 */
export function resolveColorVariantsForBulkAppend(
  variants: Record<string, VariantDecisionSlots> | undefined,
  safeSuggestions: BulkAppendSuggestion[] = []
): Record<string, VariantDecisionSlots> {
  const merged: Record<string, VariantDecisionSlots> = { ...(variants ?? {}) }

  for (const s of safeSuggestions) {
    if (s.identityTier !== "this_sku") continue
    if (!isBulkGalleryVariantKey(s.variantKey)) continue
    if (merged[s.variantKey]) continue
    merged[s.variantKey] = {
      label: s.label?.trim() || s.variantKey,
      primary: null,
      gallery: [],
      reference: [],
      rejected: [],
    }
  }

  return merged
}

/** Count color targets for bulk append (existing + safe suggestions, not confirmed-only). */
export function countColorVariantsForBulkAppend(
  variants: Record<string, VariantDecisionSlots> | undefined,
  safeSuggestions: BulkAppendSuggestion[] = []
): number {
  const merged = resolveColorVariantsForBulkAppend(variants, safeSuggestions)
  return Object.keys(merged).filter(isBulkGalleryVariantKey).length
}

/** @deprecated Use countColorVariantsForBulkAppend — kept for import stability in tests. */
export function countBulkGalleryVariants(variants: Record<string, VariantDecisionSlots> | undefined): number {
  return countColorVariantsForBulkAppend(variants, [])
}

function slotsEqual(a: VariantDecisionSlots, b: VariantDecisionSlots): boolean {
  if (a.primary !== b.primary) return false
  if (a.gallery.length !== b.gallery.length) return false
  if (!a.gallery.every((id, i) => id === b.gallery[i])) return false
  const ar = a.reference ?? []
  const br = b.reference ?? []
  if (ar.length !== br.length || !ar.every((id, i) => id === br[i])) return false
  const aj = a.rejected ?? []
  const bj = b.rejected ?? []
  return aj.length === bj.length && aj.every((id, i) => id === bj[i])
}

function stripFromSideLanes(variant: VariantDecisionSlots, mediaId: string): VariantDecisionSlots {
  const reference = (variant.reference ?? []).filter((x) => x !== mediaId)
  const rejected = (variant.rejected ?? []).filter((x) => x !== mediaId)
  if (reference.length === (variant.reference ?? []).length && rejected.length === (variant.rejected ?? []).length) {
    return variant
  }
  return { ...variant, reference, rejected }
}

/**
 * Append media to gallery tail of each color variant; preserve manual order flags.
 */
export function appendMediaToAllVariantGalleries(
  variants: Record<string, VariantDecisionSlots>,
  mediaId: string,
  safeSuggestions: BulkAppendSuggestion[] = []
): AppendToAllGalleriesResult {
  const working = resolveColorVariantsForBulkAppend(variants, safeSuggestions)
  const eligible = Object.entries(working).filter(([vk]) => isBulkGalleryVariantKey(vk))
  const targetVariantKeys = eligible.map(([vk]) => vk)

  const added: AppendToAllGalleriesResult["added"] = []
  const already: AppendToAllGalleriesResult["already"] = []
  const skipped: AppendToAllGalleriesResult["skipped"] = []

  if (eligible.length === 0) {
    return { changed: false, added, already, skipped, nextVariants: variants, targetVariantKeys }
  }

  const nextVariants: Record<string, VariantDecisionSlots> = { ...variants }

  for (const [variantKey, rawVariant] of eligible) {
    let variant = stripFromSideLanes(rawVariant, mediaId)

    if (variant.primary === mediaId) {
      already.push({ variantKey, reason: "is_primary" })
      nextVariants[variantKey] = variant
      continue
    }
    if (variant.gallery.includes(mediaId)) {
      already.push({ variantKey, reason: "already_in_gallery" })
      nextVariants[variantKey] = variant
      continue
    }

    const nextVariant = withManualGalleryOrder({
      ...variant,
      gallery: [...variant.gallery, mediaId],
    })
    if (slotsEqual(rawVariant, nextVariant) && variants[variantKey] && slotsEqual(variants[variantKey]!, nextVariant)) {
      skipped.push({ variantKey, reason: "noop" })
      continue
    }
    nextVariants[variantKey] = nextVariant
    added.push({ variantKey, label: variant.label })
  }

  return {
    changed: added.length > 0,
    added,
    already,
    skipped,
    nextVariants,
    targetVariantKeys,
  }
}

export function formatAppendToAllGalleriesNote(result: AppendToAllGalleriesResult): string {
  if (result.targetVariantKeys.length === 0) {
    return "Нет цветов для добавления"
  }
  if (result.added.length === 0 && result.already.length === 0) {
    return "Нет цветов для добавления"
  }
  if (result.added.length === 0 && result.already.length > 0) {
    return `Уже было: ${result.already.length}`
  }
  const parts = [`Добавлено: ${result.added.length}`]
  if (result.already.length > 0) parts.push(`Уже было: ${result.already.length}`)
  return parts.join(" · ")
}
