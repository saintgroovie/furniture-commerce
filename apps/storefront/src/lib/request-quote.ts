import { formatRub, getPrice } from "@/lib/format"

export const REQUEST_QUOTE_LAUNCH_MODE = "request_quote" as const

export function isRequestQuoteProduct(product: Record<string, unknown>): boolean {
  const meta = (product.metadata as Record<string, unknown> | undefined) ?? {}
  return meta.launch_mode === REQUEST_QUOTE_LAUNCH_MODE
}

/** Buyer-facing reference price: «Цена от … ₽» when a from/reference price exists. */
export function formatRequestQuotePriceLabel(
  product: Record<string, unknown>
): string | null {
  const amount = getPrice(product)
  if (amount == null) return null
  return `Цена от ${formatRub(amount)}`
}
