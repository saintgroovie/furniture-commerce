import { verifiedWwPrice } from "./verified-september-catalog"

type Row = Record<string, unknown>

function rubAmount(row: Row, key: string, allowLegacyCurrency: boolean): number | null {
  if (!(allowLegacyCurrency && row.currency_code == null) &&
      String(row.currency_code ?? "").toLowerCase() !== "rub") return null
  const n = row[key] == null ? NaN : Number(row[key])
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Quantity-one price. UI alone retains its legacy currency-less DTO support;
 * structured data requires explicit RUB. Explicit foreign currency never qualifies. */
export function variantRubPrice(variant: Row | null | undefined, allowLegacyCurrency = false): number | null {
  if (!variant) return null
  const calculated = variant.calculated_price as Row | undefined
  let amount: number | null
  if (calculated?.calculated_amount != null) {
    amount = rubAmount(calculated, "calculated_amount", allowLegacyCurrency)
  } else {
    const prices = (variant.prices as Row[] | undefined) ??
      (variant.price_set as { prices?: Row[] } | undefined)?.prices ?? []
    const base = prices.filter((p) => p.price_list_id == null &&
      p.min_quantity == null && p.max_quantity == null &&
      !Object.keys((p.rules as Row | undefined) ?? {}).length && rubAmount(p, "amount", allowLegacyCurrency) != null)
    amount = base.length === 1 ? rubAmount(base[0], "amount", allowLegacyCurrency) : null
  }
  return amount == null ? null : verifiedWwPrice(variant.id, variant.sku, amount) ?? amount
}
