/**
 * QA-only: editable suggestion drafts — single path from auto suggestion → draft → confirm.
 */

import {
  resolveVariantDisplayLabel,
  sourceLabelForVariantKey,
  type VariantLabelStatus,
} from "./legacy-color-variant-labels"
import { dedupeAndSortVariantMedia, type InvItemDedupeFields } from "./legacy-media-dedupe"
import {
  classifyVisualRole,
  pickPrimaryAndGalleryByVisualRole,
  type VisualRole,
} from "./legacy-media-visual-role-ranking"
import {
  finalSanitizeVariantGalleryOutput,
  type BorrowedSameSkuEntry,
} from "./legacy-media-variant-gallery-build"
import {
  mergeGalleryPreservingOrder,
  variantHasEstablishedGalleryOrder,
  type GalleryOrderSource,
  type VariantGalleryOrderFields,
} from "./legacy-variant-gallery-order"
import type { CandidateEntry, InvItem, SuggestedVariant } from "./legacy-media-board-types"

export type SuggestionDraftSlots = {
  label?: string
  sourceLabel?: string | null
  labelEditedByUser?: boolean
  labelStatus?: VariantLabelStatus
  primary?: string | null
  gallery?: string[]
  reference?: string[]
  rejected?: string[]
  primaryManualOverride?: boolean
  primaryAutoPicked?: boolean
  primaryNeedsReview?: boolean
  galleryOrderSource?: GalleryOrderSource | null
  galleryOrderLocked?: boolean
}

export function isVariantConfirmed(meta: { status?: string } | null | undefined): boolean {
  return meta?.status === "confirmed" || meta?.status === "edited"
}

export function isSuggestionDraft(meta: { status?: string } | null | undefined): boolean {
  return meta?.status === "suggested"
}

export function suggestionDraftWasEdited(variant: SuggestionDraftSlots | null | undefined): boolean {
  if (!variant) return false
  return Boolean(
    variant.primaryManualOverride ||
      variant.galleryOrderSource === "manual" ||
      variant.galleryOrderLocked ||
      variant.labelEditedByUser
  )
}

export function buildVariantMediaFromCandidates(
  candidateIds: string[],
  invById: Map<string, InvItem>,
  seedOrder: string[],
  candById: Map<string, CandidateEntry>,
  existing?: SuggestionDraftSlots | null,
  metaStatus?: string | null,
  opts?: { selectedSku?: string; colorToken?: string; borrowed?: BorrowedSameSkuEntry[] }
): Pick<
  SuggestionDraftSlots,
  | "primary"
  | "gallery"
  | "primaryManualOverride"
  | "primaryAutoPicked"
  | "primaryNeedsReview"
  | "galleryOrderSource"
  | "galleryOrderLocked"
> {
  const invDedupe = new Map<string, InvItemDedupeFields>()
  for (const [id, row] of Array.from(invById.entries())) invDedupe.set(id, row)
  const orderFields = existing as VariantGalleryOrderFields | null | undefined
  const preserveOrder =
    orderFields && variantHasEstablishedGalleryOrder(orderFields, metaStatus) ? orderFields.gallery : undefined
  const deduped = dedupeAndSortVariantMedia(candidateIds, invDedupe, candById, {
    seedOrder,
    preserveGalleryOrder: preserveOrder,
    selectedSku: opts?.selectedSku,
    colorToken: opts?.colorToken,
  })

  if (existing?.primaryManualOverride && existing.primary) {
    return {
      primary: existing.primary,
      gallery: mergeGalleryPreservingOrder(existing.gallery, deduped.galleryCandidateIds, existing.primary),
      primaryManualOverride: true,
      primaryAutoPicked: false,
      primaryNeedsReview: false,
      galleryOrderSource: existing.galleryOrderSource ?? "manual",
      galleryOrderLocked: true,
    }
  }

  if (orderFields && variantHasEstablishedGalleryOrder(orderFields, metaStatus)) {
    const primary = existing.primary ?? deduped.primaryCandidateId
    return {
      primary,
      gallery: mergeGalleryPreservingOrder(existing.gallery, deduped.galleryCandidateIds, primary),
      primaryManualOverride: existing.primaryManualOverride ?? false,
      primaryAutoPicked: existing.primary ? !existing.primaryManualOverride : deduped.primaryCandidateId === primary,
      primaryNeedsReview: false,
      galleryOrderSource: existing.galleryOrderSource ?? "manual",
      galleryOrderLocked: true,
    }
  }

  const pickMeta = pickPrimaryAndGalleryByVisualRole(deduped.visibleIds, invById, {
    seedOrder: preserveOrder?.length ? preserveOrder : seedOrder,
  })
  const primary = deduped.primaryCandidateId ?? pickMeta.primaryId
  let gallery =
    deduped.galleryCandidateIds.length > 0
      ? deduped.galleryCandidateIds
      : pickMeta.galleryIds.filter((id) => id !== primary)
  if (opts?.colorToken) {
    const rolesById = new Map<string, VisualRole>(
      Object.entries(deduped.rolesById ?? {}).map(([id, role]) => [id, role as VisualRole])
    )
    const sanitized = finalSanitizeVariantGalleryOutput({
      primaryId: primary,
      galleryIds: gallery.filter((id) => id !== primary),
      rolesById,
      borrowed: opts?.borrowed ?? [],
      targetColor: opts.colorToken,
      invById: invDedupe,
      productHandle: "",
      productSku: opts.selectedSku ?? "",
    })
    gallery = [...sanitized.galleryIds]
    if (primary && gallery.includes(primary)) gallery = gallery.filter((id) => id !== primary)
  }
  return {
    primary,
    gallery,
    primaryManualOverride: false,
    primaryAutoPicked: true,
    primaryNeedsReview: pickMeta.needsReview,
    galleryOrderSource: "suggestion",
    galleryOrderLocked: false,
  }
}

export function buildDraftVariantFromSuggestion(input: {
  suggestion: SuggestedVariant
  invById: Map<string, InvItem>
  candById: Map<string, CandidateEntry>
  label: string
  labelEditedByUser: boolean
  labelStatus: VariantLabelStatus
  existing?: SuggestionDraftSlots | null
  metaStatus?: string | null
}): SuggestionDraftSlots {
  const { suggestion: s } = input
  const candidateIds = [s.primaryCandidateId, ...s.galleryCandidateIds].filter(Boolean) as string[]
  const borrowed = (s.borrowedSameSku ?? []).map((b) => ({
    ...b,
    role: b.role as VisualRole,
  }))
  const media = buildVariantMediaFromCandidates(
    candidateIds,
    input.invById,
    s.galleryCandidateIds,
    input.candById,
    input.existing?.primaryManualOverride || input.existing?.galleryOrderLocked ? input.existing : null,
    input.metaStatus,
    {
      selectedSku: s.productSkuHint,
      colorToken: s.colorNameRaw,
      borrowed,
    }
  )
  return {
    label: input.label,
    sourceLabel: input.existing?.sourceLabel ?? sourceLabelForVariantKey(s.variantKey),
    labelEditedByUser: input.labelEditedByUser || Boolean(input.existing?.labelEditedByUser),
    labelStatus: input.labelEditedByUser ? "user_edited" : input.labelStatus,
    primary: media.primary ?? s.primaryCandidateId,
    gallery: media.gallery.length > 0 ? media.gallery : [...s.galleryCandidateIds],
    reference: input.existing?.reference ?? [],
    rejected: input.existing?.rejected ?? [],
    primaryManualOverride: input.existing?.primaryManualOverride ?? media.primaryManualOverride,
    primaryAutoPicked: media.primaryAutoPicked,
    primaryNeedsReview: media.primaryNeedsReview ?? s.primaryNeedsReview ?? false,
    galleryOrderSource: input.existing?.galleryOrderSource ?? media.galleryOrderSource,
    galleryOrderLocked: input.existing?.galleryOrderLocked ?? media.galleryOrderLocked,
  }
}

/** On load: flag interior/open primary on drafts without manual override (do not mutate silently). */
export function warnDraftPrimaryRole(
  variant: SuggestionDraftSlots,
  invById: Map<string, InvItem>,
  metaStatus?: string | null
): SuggestionDraftSlots {
  if (!isSuggestionDraft({ status: metaStatus }) || variant.primaryManualOverride || !variant.primary) return variant
  const inv = invById.get(variant.primary)
  if (!inv) return variant
  const role = classifyVisualRole(inv, null)
  if (role === "interior") {
    return { ...variant, primaryNeedsReview: true }
  }
  return variant
}

export function resolveSuggestionLabelForDraft(
  suggestion: SuggestedVariant,
  existing: SuggestionDraftSlots | null | undefined,
  opts: {
    legacyColorName?: string | null
    productSkuHint: string
    displayLabel?: string | null
    displayLabelEdited?: boolean
    useLegacyName?: boolean
  }
): { label: string; labelStatus: VariantLabelStatus; labelEditedByUser: boolean } {
  if (existing?.labelEditedByUser && existing.label?.trim()) {
    return { label: existing.label.trim(), labelStatus: existing.labelStatus ?? "user_edited", labelEditedByUser: true }
  }
  if (opts.displayLabelEdited && opts.displayLabel?.trim()) {
    return { label: opts.displayLabel.trim(), labelStatus: "user_edited", labelEditedByUser: true }
  }
  const resolved = resolveVariantDisplayLabel({
    variantKey: suggestion.variantKey,
    persistedLabel: opts.displayLabel ?? suggestion.label,
    legacyColorName: opts.legacyColorName,
    productSkuHint: opts.productSkuHint,
    preferLegacyColorName: opts.useLegacyName,
    seedImageUrls: suggestion.seedImageUrls,
  })
  return {
    label: resolved.displayLabel,
    labelStatus: resolved.labelStatus,
    labelEditedByUser: false,
  }
}
