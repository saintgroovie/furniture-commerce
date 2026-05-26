/**
 * v2 Media pool sort — previewable first, then exact-SKU / active color / role / selection
 * before cross-SKU fallbacks. Does not change candidate scope.
 */

import type { LegacyMediaPreviewRecoveryEntry } from "@/lib/qa/legacy-media-preview-recovery-types"
import { isEffectivePreviewable } from "./legacy-board-v2-pool-preview"
import {
  classifyMediaVariantScope,
  NEEDS_COLOR_VARIANT_KEY,
  type MediaVariantScope,
} from "./legacy-board-v2-color-variants"
import { sharedTriageSortRank } from "./legacy-board-v2-pool-classification"
import type { InvItem, V2RoleFilter } from "./legacy-board-v2-types"

export type PoolSortItem = {
  inv: InvItem
  effectiveFilter: V2RoleFilter
}

const SCOPE_SORT_ORDER: Record<MediaVariantScope, number> = {
  active: 0,
  neutral: 1,
  other_color: 2,
}

function itemShowsAsPreview(
  item: PoolSortItem,
  runtimeFailedIds: ReadonlySet<string>,
  recoveryById?: ReadonlyMap<string, LegacyMediaPreviewRecoveryEntry>
): boolean {
  return isEffectivePreviewable(item.inv, runtimeFailedIds, recoveryById)
}

/** Filename clearly belongs to this product handle (co-02-1, CO-02-1_*, co-02-1-*). */
export function isExactSkuMedia(inv: InvItem, productHandle: string | null): boolean {
  if (!productHandle) return false
  const ph = productHandle.toLowerCase()
  const fn = (inv.filename || "").toLowerCase()
  const sku = (inv.sku_hint || "").toLowerCase()
  const handle = (inv.handle_hint || "").toLowerCase()
  if (fn.includes(ph)) return true
  const compact = ph.replace(/-/g, "")
  if (fn.replace(/-/g, "").includes(compact)) return true
  if (sku === ph || handle === ph || sku.startsWith(`${ph}-`) || handle.startsWith(`${ph}-`)) {
    return true
  }
  return false
}

/** Another SKU token in filename (lon-*, co-15-2, …) — keep in pool, rank lower. */
export function isCrossSkuFilename(inv: InvItem, productHandle: string | null): boolean {
  if (!productHandle || isExactSkuMedia(inv, productHandle)) return false
  const fn = (inv.filename || "").toLowerCase()
  if (/^(lon|gr|co)-\d+/.test(fn)) return true
  if (/^lo-\d+/.test(fn)) return true
  return false
}

function roleMatchesActiveFilter(item: PoolSortItem, activeFilter: V2RoleFilter): boolean {
  if (
    activeFilter === "all" ||
    activeFilter === "no_preview" ||
    activeFilter === "unused" ||
    activeFilter === "selected"
  ) {
    return true
  }
  return item.effectiveFilter === activeFilter
}

/** Finer rank within exact-SKU previewable rows (blue front detail above color_* hero). */
function exactSkuFilenameRank(
  inv: InvItem,
  productHandle: string | null,
  variantKey: string,
  activeFilter: V2RoleFilter
): number {
  if (!isExactSkuMedia(inv, productHandle)) return 50
  const fn = (inv.filename || "").toLowerCase()
  const blueTab = variantKey === "blue"
  if (activeFilter === "front" && blueTab && fn.includes("co-02-1-blue-i1")) return 0
  if (activeFilter === "front" && fn.includes("co-02-1-blue-i1")) return 1
  if (activeFilter === "3_4" && fn.includes("co-02-1-blue-i2")) return 0
  if (fn.includes("co-02-1-blue-i1")) return 2
  if (fn.includes("co-02-1-blue-i2")) return 3
  if (/color_blue/.test(fn)) return 4
  if (/color_grey/.test(fn)) return 5
  if (/color_olive/.test(fn)) return 6
  if (/gallery_0[123]/.test(fn)) return 7
  if (/[-_]i3|iso/.test(fn)) return 8
  if (/country_p/.test(fn)) return 12
  return 10
}

export function sortPoolExactSkuPriority(
  items: PoolSortItem[],
  productHandle: string | null,
  variantKey: string,
  activeFilter: V2RoleFilter,
  currentMainId?: string | null,
  gallerySet?: Set<string>,
  runtimeFailedIds?: ReadonlySet<string>,
  recoveryById?: ReadonlyMap<string, LegacyMediaPreviewRecoveryEntry>
): PoolSortItem[] {
  const failed = runtimeFailedIds ?? new Set<string>()
  const gallery = gallerySet ?? new Set<string>()

  return [...items].sort((a, b) => {
    const aPreview = itemShowsAsPreview(a, failed, recoveryById)
    const bPreview = itemShowsAsPreview(b, failed, recoveryById)
    if (aPreview !== bPreview) return aPreview ? -1 : 1

    if (productHandle && variantKey === NEEDS_COLOR_VARIANT_KEY) {
      const aShared = sharedTriageSortRank(a.inv, productHandle)
      const bShared = sharedTriageSortRank(b.inv, productHandle)
      if (aShared !== bShared) return aShared - bShared
    }

    const aExact = isExactSkuMedia(a.inv, productHandle) ? 0 : 1
    const bExact = isExactSkuMedia(b.inv, productHandle) ? 0 : 1
    if (aExact !== bExact) return aExact - bExact

    const aCross = isCrossSkuFilename(a.inv, productHandle) ? 1 : 0
    const bCross = isCrossSkuFilename(b.inv, productHandle) ? 1 : 0
    if (aCross !== bCross) return aCross - bCross

    if (productHandle && variantKey !== "__all__" && variantKey !== NEEDS_COLOR_VARIANT_KEY) {
      const sa = classifyMediaVariantScope(a.inv, productHandle, variantKey)
      const sb = classifyMediaVariantScope(b.inv, productHandle, variantKey)
      const scopeDiff = SCOPE_SORT_ORDER[sa] - SCOPE_SORT_ORDER[sb]
      if (scopeDiff !== 0) return scopeDiff
    }

    const aRole = roleMatchesActiveFilter(a, activeFilter) ? 0 : 1
    const bRole = roleMatchesActiveFilter(b, activeFilter) ? 0 : 1
    if (aRole !== bRole) return aRole - bRole

    const aSel =
      a.inv.id === (currentMainId ?? null) || gallery.has(a.inv.id) ? 0 : 1
    const bSel =
      b.inv.id === (currentMainId ?? null) || gallery.has(b.inv.id) ? 0 : 1
    if (aSel !== bSel) return aSel - bSel

    const aFine = exactSkuFilenameRank(a.inv, productHandle, variantKey, activeFilter)
    const bFine = exactSkuFilenameRank(b.inv, productHandle, variantKey, activeFilter)
    if (aFine !== bFine) return aFine - bFine

    return (a.inv.filename || "").localeCompare(b.inv.filename || "", "ru")
  })
}

/** @deprecated Use sortPoolExactSkuPriority — kept for tests/imports */
export function sortPoolPreviewFirst(
  items: PoolSortItem[],
  productHandle: string | null,
  variantKey: string,
  currentMainId?: string | null,
  gallerySet?: Set<string>,
  runtimeFailedIds?: ReadonlySet<string>,
  recoveryById?: ReadonlyMap<string, LegacyMediaPreviewRecoveryEntry>
): PoolSortItem[] {
  return sortPoolExactSkuPriority(
    items,
    productHandle,
    variantKey,
    "all",
    currentMainId,
    gallerySet,
    runtimeFailedIds,
    recoveryById
  )
}
