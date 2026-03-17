export function formatRub(amount: number): string {
  return amount.toLocaleString("ru-RU") + " ₽"
}

export function getPrice(product: Record<string, unknown>): number | null {
  const variants = product.variants as Array<Record<string, unknown>> | undefined
  const v = variants?.[0]
  if (!v) return null
  const cp = v.calculated_price as Record<string, unknown> | undefined
  if (cp?.calculated_amount != null) return Number(cp.calculated_amount)
  const prices = v.prices as Array<Record<string, unknown>> | undefined
  if (prices?.length && prices[0].amount != null) return Number(prices[0].amount)
  return null
}
