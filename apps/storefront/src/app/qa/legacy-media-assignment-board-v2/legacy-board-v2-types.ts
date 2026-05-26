/**
 * Types for Legacy Media Assignment Board v2.
 * Commit 3: workspace + role assignment state.
 */

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
  duplicate_group_key?: string | null
  content_quick_hash?: string | null
  width?: number | null
  height?: number | null
  size_bytes?: number | null
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
  image_basenames?: string[]
}

/** Visual role slot — one of six gallery roles tracked per color variant. */
export type V2RoleSlot =
  | "main"
  | "front_anfas"
  | "front_3_4"
  | "interior"
  | "detail"
  | "lifestyle"
  | "scheme"

/** Per-color-variant role assignment state (filled in Commit 3). */
export type V2VariantRoleAssignment = Partial<Record<V2RoleSlot, string | null>>

/** Per-product assignment state keyed by variant key (e.g. "grey", "beige"). */
export type V2ProductState = {
  handle: string
  activeVariantKey: string
  rolesByVariant: Record<string, V2VariantRoleAssignment>
  galleriesByVariant: Record<string, string[]>
  rejectedIds: string[]
  /**
   * Operator-assigned visual role overrides keyed by inventory media ID.
   * Overrides the auto-detected role for pool filtering and role slot suggestions.
   * Optional for backward-compatibility with persisted state that predates this field.
   */
  roleOverrides?: Record<string, V2RoleSlot>
  /**
   * Operator display labels per color variant key (e.g. blue → «Синий матовый»).
   * Optional metadata only — apply script may ignore.
   */
  variantLabelOverrides?: Record<string, string>
  /**
   * Operator add/remove/hide color tabs for this product (QA-only, persisted in v2 LS).
   */
  operatorVariantEdits?: V2OperatorVariantEdits
}

/** Operator-added color tab (no catalog mutation). */
export type V2OperatorAddedVariant = {
  key: string
  label: string
  source: "operator"
}

/** Hidden color with assignment audit counts (still in rolesByVariant for restore). */
export type V2OperatorRemovedVariant = {
  key: string
  label: string
  hiddenAt: string
  assignment_counts: {
    main: number
    gallery: number
    roles: number
  }
}

export type V2OperatorVariantEdits = {
  added: V2OperatorAddedVariant[]
  removed: V2OperatorRemovedVariant[]
  /** Hint for export — milk default when detected */
  default_variant_key?: string
}

/** Top-level v2 board state (partial — extended in later commits). */
export type V2BoardState = {
  selectedHandle: string | null
  activeVariantKey: string | null
  productStates: Record<string, V2ProductState>
}

/** Data loading status for the skeleton shell. */
export type V2LoadStatus = "idle" | "loading" | "loaded" | "error"

/** Summary counts shown in the skeleton shell. */
export type V2DataCounts = {
  products: number
  inventoryItems: number
  candidateEntries: number
}

/** Role filter tabs in Media pool panel. */
export type V2RoleFilter =
  | "all"
  | "front"
  | "3_4"
  | "interior"
  | "detail"
  | "lifestyle"
  | "scheme"
  | "no_preview"
  /** Items not yet set as main or added to gallery for the active variant */
  | "unused"
  /** Items already set as main or in gallery for the active variant */
  | "selected"

/**
 * One detected color variant for a product, derived from pool media filenames.
 * variantKey is the raw color token (e.g. "blue", "grey") or "__all__" for uncolored products.
 */
export type V2ColorVariant = {
  variantKey: string
  label: string
  itemIds: string[]
  /** detected from filenames vs operator-added tab */
  source?: "detected" | "operator"
}

/** One row in the role checklist — computed from productState + gallery classification. */
export type V2RoleRow = {
  slot: V2RoleSlot
  label: string
  mediaId: string | null
  isCovered: boolean
  /** Origin of coverage: explicit operator slot assignment, gallery-inferred, or empty. */
  source: "explicit" | "gallery" | "none"
}
