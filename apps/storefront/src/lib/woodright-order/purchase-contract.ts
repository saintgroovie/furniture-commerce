/** Storefront mirror of buyer purchase contract CTAs (sales_mode driven). */

export type StorefrontSalesMode =
  | "in_stock"
  | "made_to_order"
  | "configurable_to_order"
  | "quote_required"
  | "bespoke_project"
  | "showroom_sample"
  | "unavailable"

export type StorefrontPurchaseFlow = "cart" | "quote" | "bespoke" | "none"

export type StorefrontPurchaseDto = {
  sales_mode?: StorefrontSalesMode | string
  modifiers?: string[]
  can_purchase?: boolean
  purchase_flow?: StorefrontPurchaseFlow | string
  cta_label?: string
  availability_label?: string
  requires_configuration?: boolean
  requires_manager?: boolean
  reason_code?: string | null
  buyer_message?: string | null
}

export const SALES_MODE_CTA_FALLBACK: Record<StorefrontSalesMode, string> = {
  in_stock: "Купить",
  made_to_order: "Заказать",
  configurable_to_order: "Настроить и заказать",
  quote_required: "Запросить расчёт",
  bespoke_project: "Обсудить проект",
  showroom_sample: "Забронировать образец",
  unavailable: "Узнать о возобновлении",
}

export function readProductPurchase(
  product: Record<string, unknown>
): StorefrontPurchaseDto | null {
  const purchase = product.purchase
  if (!purchase || typeof purchase !== "object") return null
  return purchase as StorefrontPurchaseDto
}

export function isQuoteLikePurchase(p: StorefrontPurchaseDto | null): boolean {
  if (!p) return false
  return (
    p.purchase_flow === "quote" ||
    p.sales_mode === "quote_required" ||
    p.reason_code === "QUOTE_REQUIRED" ||
    p.reason_code === "LAUNCH_MODE_REQUEST_QUOTE"
  )
}

export function isBespokeLikePurchase(p: StorefrontPurchaseDto | null): boolean {
  if (!p) return false
  return (
    p.purchase_flow === "bespoke" ||
    p.sales_mode === "bespoke_project" ||
    p.reason_code === "BESPOKE_PROJECT"
  )
}

export function isUnavailablePurchase(p: StorefrontPurchaseDto | null): boolean {
  if (!p) return false
  if (p.sales_mode === "unavailable" || p.reason_code === "UNAVAILABLE") {
    return true
  }
  return p.purchase_flow === "none" && p.can_purchase === false
}

export function ctaLabelForPurchase(
  p: StorefrontPurchaseDto | null,
  fallback: string
): string {
  if (p?.cta_label?.trim()) return p.cta_label.trim()
  const mode = p?.sales_mode as StorefrontSalesMode | undefined
  if (mode && mode in SALES_MODE_CTA_FALLBACK) {
    return SALES_MODE_CTA_FALLBACK[mode]
  }
  return fallback
}

/**
 * Kids cart-flow PDP keeps the owner-approved add-to-cart label even when
 * the purchase DTO projects sales-mode copy (`Настроить и заказать`,
 * `Заказать`). Adult configurable / quote / bespoke contracts are unchanged.
 *
 * Callers must still use the cart handler (`purchase_flow === "cart"`).
 * This helper only restores copy; it does not change classification.
 */
export function ctaLabelForDirectCartPurchase(
  p: StorefrontPurchaseDto | null,
  fallback: string,
  opts: { kidsStorefront?: boolean } = {}
): string {
  if (
    opts.kidsStorefront &&
    p &&
    p.purchase_flow === "cart" &&
    !isQuoteLikePurchase(p) &&
    !isBespokeLikePurchase(p) &&
    !isUnavailablePurchase(p)
  ) {
    return fallback
  }
  return ctaLabelForPurchase(p, fallback)
}
