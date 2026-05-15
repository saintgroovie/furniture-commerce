import type {
  LegacyColorArticleStatus,
  LegacyColorEnrichmentFetchStatus,
  LegacySwatchChecked,
  LegacyUrlChecked,
} from "@/lib/qa/legacy-color-article-enrichment"

export type InvItem = {
  id: string
  source_type: string
  source_path: string | null
  repo_relative_path: string | null
  filename: string
  collection_hint: string | null
  sku_hint: string | null
  handle_hint: string | null
  exists_locally: boolean
  previewable: boolean
  preview_reason: string | null
  url?: string | null
  page_url?: string | null
  legacy_product_url?: string | null
}

export type CandidateEntry = {
  inventory_id: string
  confidence: string
  identity_confidence: string
  filename: string
  source_type: string
  previewable: boolean
  top_candidate: {
    medusa_product_handle: string
    medusa_variant_sku: string
    medusa_collection_handle: string
    score: number
    basis: string[]
  } | null
  candidates: Array<{
    medusa_product_handle: string
    medusa_variant_sku: string
    medusa_collection_handle: string
    score: number
    basis: string[]
  }>
}

export type ProductRow = {
  handle: string
  sku: string
  collection: string
  title: string | null
  image_urls: string[]
  /** From seed-products.json — basename of each image URL for hints. */
  image_basenames?: string[]
}

/** Drag payload for legacy media board (written to dataTransfer as JSON + text/plain). */
export type LegacyMediaDragZone = "primary" | "gallery" | "reference" | "lane_reject" | "pool"

export type LegacyMediaDragPayload = {
  type: "legacy_media"
  mediaId: string
  source?: "pool" | "assigned" | "gallery" | "variant"
  fromProductHandle?: string | null
  fromZone?: LegacyMediaDragZone | null
  fromIndex?: number | null
  fromVariantKey?: string | null
}

export type LegacyBoardVariantStatus = "suggested" | "confirmed" | "edited" | "rejected"

export type VariantMetaFetchStatus = LegacyColorEnrichmentFetchStatus | "idle" | "pending"

export type VariantMetaState = {
  productSkuHint: string
  filenameColorToken: string | null
  candidateMapSku: string | null
  legacyColorName: string | null
  legacyColorArticle: string | null
  legacyColorArticleStatus: LegacyColorArticleStatus | "pending"
  legacyArticleSourceMethod: string | null
  legacyArticleSourceUrl: string | null
  rawEvidenceSnippet: string | null
  urlsChecked: LegacyUrlChecked[]
  swatchesChecked: LegacySwatchChecked[]
  hoverStatus: string | null
  sourceUrl: string | null
  fetchStatus: VariantMetaFetchStatus
  confidence: "high" | "medium" | "low"
  reasons: string[]
  sourcePathHints: string[]
  status: LegacyBoardVariantStatus
  fetchedAt: string
  useLegacyName: boolean
  useLegacyArticle: boolean
  editedLegacyArticle: string | null
}

export type VariantMetaByHandle = Record<string, Record<string, VariantMetaState>>

export type LegacyUrlCandidateWithSource = { url: string; source: string }

export type SuggestedVariant = {
  variantKey: string
  label: string
  colorNameRaw: string
  /** Catalog / Medusa product SKU — never shown as legacy color article. */
  productSkuHint: string
  /** Filename/path color token only — not a legacy article. */
  filenameColorToken: string
  /** Matcher top candidate SKU — not a legacy article. */
  candidateMapSku: string | null
  /** Ordered legacy page URL candidates with provenance. */
  candidatePageUrls: LegacyUrlCandidateWithSource[]
  /** Seed image URLs for this product (may be non-HTML; server skips binary). */
  seedImageUrls: string[]
  sourceUrl: string | null
  sourcePathHints: string[]
  mediaIds: string[]
  primaryCandidateId: string | null
  galleryCandidateIds: string[]
  confidence: "high" | "medium" | "low"
  reasons: string[]
  identityTier: "this_sku" | "needs_identity_review"
  identityNotes: string[]
  foreignHandle: string | null
  foreignSku: string | null
}

/** Pointer-based drag session (QA board only; not persisted). */
export type ActivePointerDragState = {
  mediaId: string
  fromProductHandle: string | null
  fromZone: LegacyMediaDragZone | null
  fromIndex: number | null
  startX: number
  startY: number
  currentX: number
  currentY: number
  filename: string
  previewUrl: string | null
}

/** Resolved drop target under the pointer for highlight + drop commit. */
export type HoveredLegacyDropTarget = {
  /** Matches workspace zone highlight keys, e.g. `handle|primary` or `return|handle`. */
  highlightKey: string
  /** Short label for dev status. */
  label: string
  targetHandle: string
  targetZone: "primary" | "gallery" | "reference" | "lane_reject" | "unassigned"
  /** When hovering a gallery tile, the inventory id under the pointer (insert-before / swap). */
  galleryHoverInventoryId: string | null
}

export type { LegacyColorArticleStatus, LegacyColorEnrichmentResult } from "@/lib/qa/legacy-color-article-enrichment"
