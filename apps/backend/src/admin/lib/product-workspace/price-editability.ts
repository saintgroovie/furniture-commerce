import type { PriceEditability, VariantPriceRow } from "./variant-matrix-types.ts"

function rulesNonEmpty(rules: VariantPriceRow["rules"]): boolean {
  if (!rules || typeof rules !== "object") return false
  return Object.keys(rules).length > 0
}

export function isSimpleCurrencyPrice(price: VariantPriceRow): boolean {
  if (typeof price.amount !== "number" || !Number.isFinite(price.amount)) return false
  if (!price.currency_code?.trim()) return false
  if (price.min_quantity != null || price.max_quantity != null) return false
  if (price.price_list_id) return false
  if (rulesNonEmpty(price.rules)) return false
  return true
}

export function classifyCurrencyPrices(
  prices: VariantPriceRow[] | null | undefined,
  currency_code: string
): PriceEditability {
  const code = currency_code.trim().toLowerCase()
  const list = (prices ?? []).filter(
    (p) => (p.currency_code ?? "").trim().toLowerCase() === code
  )
  if (list.length === 0) return { kind: "missing" }
  if (list.length > 1) {
    return {
      kind: "ambiguous",
      reason: `Несколько цен в валюте ${code.toUpperCase()} — редактируйте в стандартной админке.`,
    }
  }
  const price = list[0]
  if (!isSimpleCurrencyPrice(price)) {
    return {
      kind: "complex",
      reason: "Сложная цена (правила или порог количества). Откройте стандартную админку.",
      price,
    }
  }
  if (price.amount === 0) return { kind: "zero", price }
  return { kind: "simple", price }
}

export function variantPriceMutationGate(prices: VariantPriceRow[] | null | undefined): {
  allowed: boolean
  reason: string | null
  editable_currencies: string[]
} {
  const list = prices ?? []
  for (const p of list) {
    if (!isSimpleCurrencyPrice(p)) {
      return {
        allowed: false,
        reason: "У варианта есть сложная цена — изменение цен только в стандартной админке.",
        editable_currencies: [],
      }
    }
  }
  const byCurrency = new Map<string, number>()
  for (const p of list) {
    const c = p.currency_code.trim().toLowerCase()
    byCurrency.set(c, (byCurrency.get(c) ?? 0) + 1)
  }
  for (const [c, n] of byCurrency) {
    if (n > 1) {
      return {
        allowed: false,
        reason: `Неоднозначные цены для ${c.toUpperCase()}.`,
        editable_currencies: [],
      }
    }
  }
  return {
    allowed: true,
    reason: null,
    editable_currencies: [...byCurrency.keys()].sort(),
  }
}
