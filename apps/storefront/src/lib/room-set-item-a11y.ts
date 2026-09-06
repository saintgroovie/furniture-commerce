/**
 * RoomSet detail product-row accessibility helpers.
 *
 * Contract (Pattern A):
 * - one Link per product item
 * - explicit aria-label with buyer-facing title (concise accessible name)
 * - image alt = buyer-facing title (never SKU / Medusa id)
 * - aria-label wins for the link name → title is not duplicated in the tree
 */

export function roomSetProductLinkAriaLabel(productTitle: string): string {
  const title = productTitle.trim() || "Товар"
  return `Открыть товар «${title}»`
}

export function roomSetProductThumbAlt(productTitle: string): string {
  return productTitle.trim() || "Товар"
}
