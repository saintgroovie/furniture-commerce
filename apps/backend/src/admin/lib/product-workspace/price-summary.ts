import type { PriceAmount, PriceSummaryView } from "./types"

function normalizeCurrency(code: string): string {
  return code.trim().toLowerCase()
}

/**
 * Honest price range from variant price rows. Does not invent amounts.
 * Multi-currency → separate groups (never mixed into one range).
 */
export function buildPriceSummary(
  variantCount: number,
  pricesByVariant: Array<PriceAmount[] | null | undefined>
): PriceSummaryView {
  let without = 0
  const byCurrency = new Map<string, number[]>()

  for (const prices of pricesByVariant) {
    const list = (prices ?? []).filter(
      (p) =>
        typeof p.amount === "number" &&
        Number.isFinite(p.amount) &&
        typeof p.currency_code === "string" &&
        p.currency_code.trim()
    )
    if (list.length === 0) {
      without += 1
      continue
    }
    for (const p of list) {
      const c = normalizeCurrency(p.currency_code)
      const arr = byCurrency.get(c) ?? []
      arr.push(p.amount)
      byCurrency.set(c, arr)
    }
  }

  const groups = [...byCurrency.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency_code, amounts]) => ({
      currency_code,
      min: Math.min(...amounts),
      max: Math.max(...amounts),
      priced_variant_count: pricesByVariant.filter((prices) =>
        (prices ?? []).some((p) => normalizeCurrency(p.currency_code) === currency_code)
      ).length,
    }))

  if (variantCount === 0) {
    return {
      groups: [],
      variants_without_price: 0,
      variant_count: 0,
      label: "Нет вариантов",
      warning: null,
    }
  }

  if (groups.length === 0) {
    return {
      groups: [],
      variants_without_price: without,
      variant_count: variantCount,
      label: "Цена не задана",
      warning: "Ни у одного варианта нет цены.",
    }
  }

  const primary = groups[0]
  const same = primary.min === primary.max
  const label =
    groups.length === 1
      ? same
        ? `${formatMoney(primary.min, primary.currency_code)}`
        : `${formatMoney(primary.min, primary.currency_code)} – ${formatMoney(primary.max, primary.currency_code)}`
      : `Несколько валют (${groups.map((g) => g.currency_code.toUpperCase()).join(", ")})`

  return {
    groups,
    variants_without_price: without,
    variant_count: variantCount,
    label,
    warning:
      without > 0
        ? `Вариантов без цены: ${without}`
        : groups.length > 1
          ? "Цены в разных валютах показаны отдельными группами."
          : null,
  }
}

export function formatMoney(amount: number, currency_code: string): string {
  const code = currency_code.toUpperCase()
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: code === "RUB" ? "RUB" : code,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${amount} ${code}`
  }
}
