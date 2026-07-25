/**
 * Pure planners for RoomSet V1 seed interruption recovery (no Medusa deps).
 */
export type ItemRow = {
  id?: string
  sort_order?: number
  products?: Array<{ id?: string; handle?: string }>
}

export type ItemsAction =
  | "create_all"
  | "complete_orphan_links"
  | "reconcile_partial"
  | "noop"
  | "conflict"

export function itemHandles(items: ItemRow[]): Array<string | null> {
  return items.map((it) => {
    const products = it.products
    if (Array.isArray(products) && products.length > 1) return null
    const h = products?.[0]?.handle
    return typeof h === "string" ? h : null
  })
}

/**
 * Require contiguous zero-based sort_order slots after ascending sort.
 * Gaps / duplicates / missing / negative → not a recoverable prefix.
 */
export function sortOrdersAreContiguousSlots(items: ItemRow[]): boolean {
  for (let i = 0; i < items.length; i++) {
    const so = items[i]?.sort_order
    if (typeof so !== "number" || !Number.isInteger(so) || so !== i) {
      return false
    }
  }
  return true
}

function itemHasAmbiguousProductLinks(item: ItemRow): boolean {
  return Array.isArray(item.products) && item.products.length > 1
}

/**
 * Classify item/link state for idempotent interruption recovery.
 * Items must already be sorted by sort_order ascending.
 */
export function classifyItemsAction(
  items: ItemRow[],
  desired: string[]
): ItemsAction {
  if (items.length === 0) return "create_all"
  if (items.length > desired.length) return "conflict"
  if (!sortOrdersAreContiguousSlots(items)) return "conflict"
  if (!items.every((it) => typeof it.id === "string")) return "conflict"
  // Application invariant: each room_set_item links to exactly 0 or 1 product.
  if (items.some(itemHasAmbiguousProductLinks)) return "conflict"

  const handles = itemHandles(items)

  const prefixCompatible = (n: number): boolean => {
    for (let i = 0; i < n; i++) {
      const h = handles[i]
      if (h == null) continue
      if (h !== desired[i]) return false
    }
    return true
  }

  if (!prefixCompatible(handles.length)) return "conflict"

  if (
    handles.length === desired.length &&
    handles.every((h, i) => h === desired[i])
  ) {
    return "noop"
  }

  if (handles.length === desired.length && handles.every((h) => h == null)) {
    return "complete_orphan_links"
  }

  // Partial prefix (fewer items and/or some orphans) — recoverable.
  return "reconcile_partial"
}
