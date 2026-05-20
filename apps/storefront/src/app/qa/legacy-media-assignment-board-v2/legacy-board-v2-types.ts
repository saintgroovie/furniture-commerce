/**
 * Types for Legacy Media Assignment Board v2.
 * Commit 1: route skeleton + data loading.
 * No assignment logic, export, localStorage, or drag/drop in this file.
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
