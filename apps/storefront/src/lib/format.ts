export function formatRub(amount: number): string {
  return amount.toLocaleString("ru-RU") + " ₽"
}

/** Short customer-facing order number (Medusa display_id, not internal order_… id). */
export function getOrderDisplayNumber(order: Record<string, unknown>): string {
  const custom = order.custom_display_id
  if (custom != null && String(custom).trim()) {
    return String(custom)
  }
  const displayId = order.display_id
  if (displayId != null && String(displayId).trim() !== "") {
    return String(displayId)
  }
  const id = String(order.id ?? "")
  const suffix = id.replace(/^order_/i, "")
  return suffix.length > 8 ? suffix.slice(-8).toUpperCase() : suffix.toUpperCase()
}

/** Medusa v2 amounts are major currency units (rubles for RUB). */
export function getPrice(product: Record<string, unknown>): number | null {
  const variants = product.variants as Array<Record<string, unknown>> | undefined
  const v = variants?.[0]
  if (!v) return null
  const cp = v.calculated_price as Record<string, unknown> | undefined
  if (cp?.calculated_amount != null) return Number(cp.calculated_amount)
  const prices =
    (v.prices as Array<Record<string, unknown>> | undefined) ??
    (v.price_set as { prices?: Array<Record<string, unknown>> } | undefined)?.prices
  if (prices?.length && prices[0].amount != null) return Number(prices[0].amount)
  return null
}
