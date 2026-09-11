/**
 * Promotion Window placement (documented product contract).
 *
 * The window is NOT a catalog grid cell. It is a separate rotating card that
 * lives in the page's RIGHT gutter - the leftover space to the right of the
 * last catalog column - mirroring the filter card in the left gutter
 * (`.catalog-filter-sidebar`). The product grid keeps its own columns, row
 * rhythm, sort order and pagination untouched.
 *
 * - Rendered once per catalog page, sticky next to the grid, never travelling
 *   below the last product row (same height-rail technique as the filters).
 * - Visible only where the gutter can hold a legible card (CSS: ≥ 1551px →
 *   rail ≥ 150px after the page margin; same breakpoint where the filter
 *   card leaves the content area). Narrower viewports have
 *   no usable "остаток" right of the grid → the window is not shown; it never
 *   falls back into the grid or into a horizontal banner.
 * - Shown on every browse view with a non-empty result set: it sits outside
 *   the result list, so it does not interfere with filters, search or sort.
 * - Requires at least one resolved sale item (backend already filtered
 *   unpublished / BESPOKE / not purchasable / no sale / no image).
 */
import type { PromotionSlotPayload } from "./api/promotion-slot"

/** Min viewport width (px) at which the right gutter can hold the window. */
export const PROMOTION_WINDOW_MIN_VIEWPORT = 1551

export function shouldShowPromotionWindow(
  slot: PromotionSlotPayload | null | undefined,
  resultCount: number
): slot is PromotionSlotPayload {
  return Boolean(slot && slot.slot && slot.items.length > 0 && resultCount > 0)
}
