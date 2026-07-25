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

export type SlotState = "orphan" | "linked" | "unresolved" | "ambiguous"

/** Classify one item's product-link slot. Only true orphans are recoverable. */
export function slotState(item: ItemRow): SlotState {
  const products = item.products
  if (!Array.isArray(products) || products.length === 0) return "orphan"
  if (products.length > 1) return "ambiguous"
  const h = products[0]?.handle
  if (typeof h === "string" && h.length > 0) return "linked"
  // Product stub present without handle — not a recoverable orphan.
  return "unresolved"
}

export function itemHandles(items: ItemRow[]): Array<string | null> {
  return items.map((it) => {
    const st = slotState(it)
    if (st !== "linked") return null
    return it.products![0]!.handle as string
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

  const states = items.map(slotState)
  if (states.some((s) => s === "ambiguous" || s === "unresolved")) {
    return "conflict"
  }

  const handles = itemHandles(items)

  const prefixCompatible = (n: number): boolean => {
    for (let i = 0; i < n; i++) {
      const st = states[i]
      if (st === "orphan") continue
      if (handles[i] !== desired[i]) return false
    }
    return true
  }

  if (!prefixCompatible(handles.length)) return "conflict"

  if (
    handles.length === desired.length &&
    states.every((s) => s === "linked") &&
    handles.every((h, i) => h === desired[i])
  ) {
    return "noop"
  }

  if (
    handles.length === desired.length &&
    states.every((s) => s === "orphan")
  ) {
    return "complete_orphan_links"
  }

  // Partial prefix: linked and/or true orphans only.
  return "reconcile_partial"
}
