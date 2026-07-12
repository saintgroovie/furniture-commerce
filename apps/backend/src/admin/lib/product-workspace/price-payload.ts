import type { VariantPriceRow } from "./variant-matrix-types.ts"
import { isSimpleCurrencyPrice, variantPriceMutationGate } from "./price-editability.ts"

export type PricePayloadItem = {
  id?: string
  amount: number
  currency_code: string
}

export type BuildPricesPayloadResult =
  | { ok: true; prices: PricePayloadItem[] }
  | {
      ok: false
      code:
        | "blocked_complex"
        | "currency_required"
        | "invalid_amount"
        | "ambiguous_currency"
        | "missing_target_for_update"
    }

/**
 * Full-replacement safe builder: always includes every simple price that must survive.
 */
export function buildVariantPricesPayload(args: {
  existing: VariantPriceRow[] | null | undefined
  currency_code: string
  amount: number
  mode: "update" | "add"
}): BuildPricesPayloadResult {
  const gate = variantPriceMutationGate(args.existing)
  if (!gate.allowed) {
    return { ok: false, code: "blocked_complex" }
  }
  const currency = args.currency_code.trim().toLowerCase()
  if (!currency) return { ok: false, code: "currency_required" }
  if (typeof args.amount !== "number" || !Number.isFinite(args.amount) || args.amount < 0) {
    return { ok: false, code: "invalid_amount" }
  }

  const existing = (args.existing ?? []).filter(isSimpleCurrencyPrice)
  const others = existing.filter((p) => p.currency_code.trim().toLowerCase() !== currency)
  const target = existing.find((p) => p.currency_code.trim().toLowerCase() === currency)

  if (args.mode === "update" && !target) {
    return { ok: false, code: "missing_target_for_update" }
  }
  if (args.mode === "add" && target) {
    // treat as update of existing simple price
  }

  const next: PricePayloadItem[] = others.map((p) => ({
    id: p.id,
    amount: p.amount,
    currency_code: p.currency_code.trim().toLowerCase(),
  }))

  if (target) {
    next.push({
      id: target.id,
      amount: args.amount,
      currency_code: currency,
    })
  } else {
    next.push({
      amount: args.amount,
      currency_code: currency,
    })
  }

  return { ok: true, prices: next }
}
