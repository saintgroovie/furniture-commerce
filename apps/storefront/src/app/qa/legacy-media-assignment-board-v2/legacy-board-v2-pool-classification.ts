/**
 * v2 Media pool — per-tab inclusion + classification for real color vs Общие кадры triage.
 * Does not change candidate scope (still top_candidate ids only).
 */

import { extractColorTokenFromMedia } from "@/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"
import type { InvItem } from "./legacy-board-v2-types"
import {
  NEEDS_COLOR_VARIANT_KEY,
  isNeutralSharedMedia,
  classifyMediaVariantScope,
  type MediaVariantScope,
} from "./legacy-board-v2-color-variants"
import { inferV2VisualRole } from "./legacy-board-v2-role-inference"
import { isCrossSkuFilename, isExactSkuMedia } from "./legacy-board-v2-pool-sort"

/** Classification for real color tabs (sort/debug). */
export type RealColorPoolClassification =
  | "active_color_auto"
  | "active_color_inferred"
  | "shared_candidate"
  | "other_color"
  | "no_preview"

/** Classification for Общие кадры broad triage pool. */
export type SharedTriagePoolClassification =
  | "shared_neutral"
  | "ambiguous"
  | "interior_detail_lifestyle_scheme"
  | "borrowed_or_non_exact"
  | "duplicate_cluster"
  | "other_shared_candidate"
  | "excluded_confident_color_specific"

export type PoolTabClassification = RealColorPoolClassification | SharedTriagePoolClassification

const ROLE_SHARED_TABS = new Set(["interior", "detail", "lifestyle", "scheme"])

function filenameImpliesColorToken(fn: string, colorKey: string): boolean {
  const lower = fn.toLowerCase()
  const key = colorKey.toLowerCase()
  if (lower.includes(`color_${key}`)) return true
  if (new RegExp(`[-_]${key}[-_.]`, "i").test(lower)) return true
  if (key === "cream" && /[-_](milk|cream|molochny)[-_.]/i.test(lower)) return true
  return false
}

/** Exact-SKU media confidently owned by one real color tab (not neutral gallery/iso). */
export function isConfidentColorOwnedMedia(
  inv: InvItem,
  productHandle: string,
  realColorVariantKeys: readonly string[]
): boolean {
  if (!isExactSkuMedia(inv, productHandle)) return false
  if (isNeutralSharedMedia(inv, productHandle)) return false

  const fn = inv.filename || ""
  const token = extractColorTokenFromMedia(inv, productHandle)

  for (const key of realColorVariantKeys) {
    if (classifyMediaVariantScope(inv, productHandle, key) !== "active") continue
    if (token === key) return true
    if (!token && filenameImpliesColorToken(fn, key)) return true
  }
  return false
}

function hasConfidentRealColorToken(
  inv: InvItem,
  productHandle: string,
  realColorVariantKeys: readonly string[]
): string | null {
  if (!isConfidentColorOwnedMedia(inv, productHandle, realColorVariantKeys)) return null
  const token = extractColorTokenFromMedia(inv, productHandle)
  if (token && realColorVariantKeys.includes(token)) return token
  const fn = inv.filename || ""
  for (const key of realColorVariantKeys) {
    if (filenameImpliesColorToken(fn, key)) return key
  }
  return null
}

/**
 * Whether this inventory row belongs in the media pool for the active color tab.
 * Real color tabs: all top candidates (sort ranks by scope).
 * Общие кадры: broad triage — not only legacy __needs_color__ / neutral subset.
 */
export function shouldIncludeInMediaPool(
  inv: InvItem,
  productHandle: string,
  activeVariantKey: string,
  realColorVariantKeys: readonly string[]
): boolean {
  if (activeVariantKey !== NEEDS_COLOR_VARIANT_KEY) return true
  return shouldIncludeInSharedTriagePool(inv, productHandle, realColorVariantKeys)
}

/** @deprecated Inverted legacy predicate — kept for forensic diff only. */
export function legacySharedPoolPredicate(
  inv: InvItem,
  productHandle: string
): boolean {
  const scope = classifyMediaVariantScope(inv, productHandle, NEEDS_COLOR_VARIANT_KEY)
  return scope === "active" || scope === "neutral"
}

/**
 * Общие кадры — broad triage pool: everything in top_candidate except confident
 * single-color exact-SKU shots (those belong on real color tabs).
 */
export function shouldIncludeInSharedTriagePool(
  inv: InvItem,
  productHandle: string,
  realColorVariantKeys: readonly string[]
): boolean {
  if (isConfidentColorOwnedMedia(inv, productHandle, realColorVariantKeys)) {
    return false
  }
  return true
}

/** Sort tier for shared triage tab — lower appears first (within preview tier). */
export function sharedTriageSortRank(inv: InvItem, productHandle: string): number {
  if (isCrossSkuFilename(inv, productHandle)) return 0
  if (!isExactSkuMedia(inv, productHandle)) return 1
  const role = inferV2VisualRole(inv, { productHandle }).role
  if (ROLE_SHARED_TABS.has(role)) return 2
  const token = extractColorTokenFromMedia(inv, productHandle)
  if (!token) return 3
  if (isNeutralSharedMedia(inv, productHandle)) return 5
  return 4
}

export function classifyForRealColorTab(
  inv: InvItem,
  productHandle: string,
  activeVariantKey: string,
  staticPreviewable: boolean
): RealColorPoolClassification {
  if (!staticPreviewable) return "no_preview"
  const scope = classifyMediaVariantScope(inv, productHandle, activeVariantKey)
  if (scope === "active") return "active_color_auto"
  if (scope === "neutral") return "shared_candidate"
  if (scope === "other_color") return "other_color"
  return "active_color_inferred"
}

export function classifyForSharedTriageTab(
  inv: InvItem,
  productHandle: string,
  realColorVariantKeys: readonly string[],
  staticPreviewable: boolean,
  duplicateSourceCount?: number
): SharedTriagePoolClassification {
  if (!staticPreviewable) return "other_shared_candidate"

  const confidentColor = isConfidentColorOwnedMedia(inv, productHandle, realColorVariantKeys)
  if (confidentColor) return "excluded_confident_color_specific"

  if (duplicateSourceCount && duplicateSourceCount > 1) return "duplicate_cluster"

  if (isCrossSkuFilename(inv, productHandle) || !isExactSkuMedia(inv, productHandle)) {
    return "borrowed_or_non_exact"
  }

  if (isNeutralSharedMedia(inv, productHandle)) return "shared_neutral"

  const role = inferV2VisualRole(inv, { productHandle }).role
  if (ROLE_SHARED_TABS.has(role)) return "interior_detail_lifestyle_scheme"

  const token = extractColorTokenFromMedia(inv, productHandle)
  if (!token) return "ambiguous"

  return "other_shared_candidate"
}

export function poolClassificationLabel(
  activeVariantKey: string,
  classification: PoolTabClassification
): string {
  return `${activeVariantKey}:${classification}`
}

export function mediaVariantScopeForTab(
  inv: InvItem,
  productHandle: string,
  activeVariantKey: string
): MediaVariantScope {
  return classifyMediaVariantScope(inv, productHandle, activeVariantKey)
}
