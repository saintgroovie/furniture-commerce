/** RUB major-unit sanity for seller price edits. Not a pricing policy. */

import type { VariantRubPrice } from "./seller-product-types"

export type { VariantRubPrice } from "./seller-product-types"

export const PRICE_SANITY_MIN = 1_000
export const PRICE_SANITY_MAX = 10_000_000

export type PriceParseFailure = {
  ok: false
  code: "empty" | "not_integer" | "not_positive"
  message: string
}

export type PriceParseSuccess = {
  ok: true
  amount: number
}

export type PriceParseResult = PriceParseSuccess | PriceParseFailure

export type PriceSaveAssessment =
  | { decision: "reject"; message: string }
  | { decision: "confirm"; amount: number; previous: number; message: string }
  | { decision: "save"; amount: number; range_warning?: string }

const NBSP = "\u00a0"

export function formatRubAmount(amount: number): string {
  const formatted = new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(amount)
  return `${formatted}${NBSP}₽`
}

export function formatSellerPriceInput(amount: number): string {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(amount)
}

export function parseSellerPriceInput(raw: string): PriceParseResult {
  const trimmed = raw.replace(/\s|\u00a0/g, "").trim()
  if (!trimmed) {
    return { ok: false, code: "empty", message: "Укажите цену" }
  }
  if (!/^-?\d+$/.test(trimmed)) {
    return { ok: false, code: "not_integer", message: "Укажите цену без копеек" }
  }
  const amount = Number(trimmed)
  if (!Number.isSafeInteger(amount)) {
    return { ok: false, code: "not_integer", message: "Укажите цену без копеек" }
  }
  if (amount <= 0) {
    return { ok: false, code: "not_positive", message: "Укажите цену" }
  }
  return { ok: true, amount }
}

function isOutsideSanityRange(amount: number): boolean {
  return amount < PRICE_SANITY_MIN || amount > PRICE_SANITY_MAX
}

/**
 * Decide whether a parsed positive integer price may be saved.
 * Existing catalog outliers stay editable; new jumps into the typo range are blocked.
 */
export function assessPriceSave(
  amount: number,
  previous: number | null
): PriceSaveAssessment {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return { decision: "reject", message: "Укажите цену" }
  }

  if (isOutsideSanityRange(amount)) {
    const previousIsOutlier =
      previous != null && Number.isFinite(previous) && isOutsideSanityRange(previous)
    if (previous != null && previous === amount) {
      return { decision: "save", amount }
    }
    if (previousIsOutlier) {
      return {
        decision: "save",
        amount,
        range_warning: "Сумма выходит за обычный диапазон. Проверьте перед сохранением",
      }
    }
    return {
      decision: "reject",
      message: "Проверьте сумму. Цена должна быть от 1 000 до 10 000 000 ₽",
    }
  }

  if (
    previous != null &&
    previous > 0 &&
    Number.isFinite(previous) &&
    (amount > previous * 3 || amount < previous / 3)
  ) {
    return {
      decision: "confirm",
      amount,
      previous,
      message: "Цена сильно отличается от текущей",
    }
  }

  return { decision: "save", amount }
}

export function extractVariantRubPrices(variant: Record<string, unknown>): VariantRubPrice[] {
  const nested = variant.price_set as { prices?: unknown } | undefined
  const raw = variant.prices ?? nested?.prices
  if (!Array.isArray(raw)) return []

  const out: VariantRubPrice[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const row = item as {
      id?: unknown
      amount?: unknown
      currency_code?: unknown
      price_list_id?: unknown
    }
    if (typeof row.price_list_id === "string" && row.price_list_id) continue
    const amount = row.amount
    if (typeof amount !== "number" || !Number.isFinite(amount)) continue
    const currency =
      typeof row.currency_code === "string" ? row.currency_code.toLowerCase() : "rub"
    if (currency !== "rub") continue
    out.push({
      id: typeof row.id === "string" && row.id ? row.id : null,
      amount,
      currency_code: "rub",
    })
  }
  return out
}

export function pickPrimaryRubPrice(variant: Record<string, unknown>): VariantRubPrice | null {
  const prices = extractVariantRubPrices(variant)
  return prices[0] ?? null
}

/**
 * RUB row of the canonical catalog promo price list. Read-only projection for
 * the desk; never used as the base price. Without a known list id nothing is
 * guessed - the editor then shows «акции нет», and writes still go through
 * `findCatalogPromoPriceList`.
 */
export function pickPromoRubPrice(
  variant: Record<string, unknown>,
  promoPriceListId: string | null | undefined
): { amount: number; price_list_id: string } | null {
  if (!promoPriceListId) return null
  const nested = variant.price_set as { prices?: unknown } | undefined
  const raw = variant.prices ?? nested?.prices
  if (!Array.isArray(raw)) return null
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const row = item as { amount?: unknown; currency_code?: unknown; price_list_id?: unknown }
    if (row.price_list_id !== promoPriceListId) continue
    if (typeof row.amount !== "number" || !Number.isFinite(row.amount)) continue
    const currency = typeof row.currency_code === "string" ? row.currency_code.toLowerCase() : "rub"
    if (currency !== "rub") continue
    return { amount: row.amount, price_list_id: row.price_list_id }
  }
  return null
}

export type BasePriceRow = {
  id: string
  amount: number
  currency_code: string
  price_list_id?: string | null
}

/** Keep every base price. Only the selected ruble row changes. */
export function mergeBasePriceUpdate(
  prices: BasePriceRow[],
  targetId: string,
  nextAmount: number
): Array<{ id: string; amount: number; currency_code: string }> | null {
  const base = prices.filter((price) => !price.price_list_id)
  if (!base.some((price) => price.id === targetId)) return null
  return base.map((price) => ({
    id: price.id,
    currency_code: price.currency_code,
    amount: price.id === targetId ? nextAmount : price.amount,
  }))
}

export function productHasRubPrice(product: Record<string, unknown>): boolean {
  const variants = product.variants
  if (!Array.isArray(variants) || variants.length === 0) return false
  return variants.some((variant) => {
    if (!variant || typeof variant !== "object") return false
    const price = pickPrimaryRubPrice(variant as Record<string, unknown>)
    return price != null && price.amount > 0
  })
}
