/**
 * Types for Legacy Media Assignment Board v2.
 * Commit 3: workspace + role assignment state.
 */

// Re-export stable v1 types so v2 components import from one place.
export type { InvItem, CandidateEntry, ProductRow } from "../legacy-media-assignment-board/legacy-media-board-types"

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
