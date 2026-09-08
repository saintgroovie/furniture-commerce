/**
 * Catalog grid items: regular product cards + at most one Promotion Window card.
 *
 * Placement rule (documented product contract):
 * - Only the main catalog (`/catalog`) in its default view - no search, no
 *   type/category/collection/price filter, no explicit sort. Filtered / sorted
 *   subsets and Kids keep the plain grid; repeating one promo across narrow
 *   result sets adds nothing and would break sort semantics.
 * - The card takes the LAST cell of the FIRST row on the widest breakpoint.
 *   The catalog grid is 3 columns on desktop (`.catalog-product-grid`), so the
 *   slot index is 2 (columns - 1). On 2 / 1 column breakpoints the card simply
 *   flows with the grid - no gaps, no forced column.
 * - Inserted once per result set. Never padded with placeholder cards: when
 *   the result set is shorter than the slot index the card goes last.
 */
import type { CatalogFilterState } from "./catalog-filters"
import type { DisplayEntry } from "./display-group"
import type { PromotionSlotPayload } from "./api/promotion-slot"

/** Desktop column count of `.catalog-product-grid` (see globals.css). */
export const CATALOG_DESKTOP_COLUMNS = 3

/** DOM index of the promotion card = last cell of the first desktop row. */
export const PROMOTION_SLOT_INDEX = CATALOG_DESKTOP_COLUMNS - 1

export type ProductGridItem = {
  kind: "product"
  key: string
  entry: DisplayEntry
  /** Index among product cards only (for `priorityHero`). */
  productIndex: number
}

export type PromotionGridItem = {
  kind: "promotion"
  key: string
  slot: PromotionSlotPayload
}

export type CatalogGridItem = ProductGridItem | PromotionGridItem

/** Default main-catalog view: no query, filters or explicit sort. */
export function isDefaultCatalogView(state: CatalogFilterState): boolean {
  return (
    !state.q?.trim() &&
    !state.type &&
    state.category.length === 0 &&
    state.collection.length === 0 &&
    state.priceMin == null &&
    state.priceMax == null &&
    !state.sort
  )
}

export function shouldShowPromotion(
  slot: PromotionSlotPayload | null | undefined,
  state: CatalogFilterState,
  resultCount: number
): slot is PromotionSlotPayload {
  return Boolean(
    slot && slot.slot && slot.items.length > 0 && resultCount > 0 && isDefaultCatalogView(state)
  )
}

export function buildCatalogGridItems(
  entries: DisplayEntry[],
  slot: PromotionSlotPayload | null | undefined,
  state: CatalogFilterState
): CatalogGridItem[] {
  const items: CatalogGridItem[] = entries.map((entry, index) => ({
    kind: "product",
    key: (entry.product as Record<string, unknown>).id as string,
    entry,
    productIndex: index,
  }))
  if (!shouldShowPromotion(slot, state, entries.length)) return items
  const promo: PromotionGridItem = {
    kind: "promotion",
    key: `promotion:${slot.slot!.id}`,
    slot,
  }
  const at = Math.min(PROMOTION_SLOT_INDEX, items.length)
  items.splice(at, 0, promo)
  return items
}
