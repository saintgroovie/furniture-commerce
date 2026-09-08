import { formatRub, getPrice } from "@/lib/format"
import { isKidsStorefrontProduct } from "@/lib/kids"
import {
  isDirectCartPurchase,
  isQuoteLikePurchase,
  readProductPurchase,
} from "@/lib/woodright-order/purchase-contract"

export const REQUEST_QUOTE_LAUNCH_MODE = "request_quote" as const

function productClassificationType(
  product: Record<string, unknown>
): string | undefined {
  return (
    (product.product_classification as { product_type?: string } | undefined)
      ?.product_type ??
    (product.custom_product_type as { product_type?: string } | undefined)
      ?.product_type
  )
}

function readPolicySalesMode(product: Record<string, unknown>): string | null {
  const raw = product.product_sales_policy as
    | { sales_mode?: unknown }
    | Array<{ sales_mode?: unknown }>
    | null
    | undefined
  const policy = Array.isArray(raw) ? raw[0] : raw
  if (policy && typeof policy.sales_mode === "string") return policy.sales_mode
  return null
}

/**
 * Launch freeze `metadata.launch_mode=request_quote` still marks adult
 * STANDARD/CONFIGURABLE as quote-only.
 *
 * Kids is a navigation layer, not a purchase ban: selectable motif / execution
 * must not force lead CTA. Ignore stale launch_mode unless the product is
 * actually BESPOKE or an explicit quote sales mode is present.
 * Explicit `product_sales_policy.sales_mode=quote_required` wins over a
 * conflicting cart purchase DTO (fail closed).
 */
export function isRequestQuoteProduct(product: Record<string, unknown>): boolean {
  const purchase = readProductPurchase(product)
  if (purchase && isQuoteLikePurchase(purchase)) return true
  if (readPolicySalesMode(product) === "quote_required") return true
  if (purchase && isDirectCartPurchase(purchase)) return false

  const meta = (product.metadata as Record<string, unknown> | undefined) ?? {}
  if (meta.launch_mode !== REQUEST_QUOTE_LAUNCH_MODE) return false
  if (isKidsStorefrontProduct(product)) {
    return productClassificationType(product) === "BESPOKE"
  }
  return true
}

/** Buyer-facing reference price: «от … ₽» when a from/reference price exists. */
export function formatRequestQuotePriceLabel(
  product: Record<string, unknown>
): string | null {
  const amount = getPrice(product)
  if (amount == null) return null
  return `от ${formatRub(amount)}`
}
