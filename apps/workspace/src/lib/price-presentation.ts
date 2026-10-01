/**
 * Price editor state. Promo percent is display-only and computed from the two
 * stored amounts; it is never a source of truth.
 */
export type PriceConflict = {
  variant_id: string
  server_amount: number | null
  your_amount: number | null
}

export function parsePriceConflict(query: Record<string, string | undefined>): PriceConflict | null {
  if (query.conflict !== "price") return null
  const server = Number(query.server_amount)
  const yours = Number(query.your_amount)
  return {
    variant_id: query.variant_id ?? "",
    server_amount: Number.isFinite(server) && query.server_amount ? server : null,
    your_amount: Number.isFinite(yours) && query.your_amount ? yours : null,
  }
}

export function discountPercent(base: number | null | undefined, sale: number | null | undefined): number | null {
  if (!base || !sale || base <= 0 || sale >= base) return null
  return Math.round((1 - sale / base) * 100)
}

export function parseRubInput(raw: string | null | undefined): number | null {
  if (raw == null) return null
  const digits = String(raw).replace(/[\s\u00a0]/g, "")
  if (!/^\d+$/.test(digits)) return null
  const value = Number(digits)
  return value > 0 ? value : null
}

export type PriceEditorState =
  | { kind: "bespoke" }
  | { kind: "missing" }
  | {
      kind: "set"
      base: number
      /** Stored promotional amount, even when it no longer undercuts the base (so it can still be removed). */
      promo: number | null
      /** True only when the stored promo is below the base - then the percent is meaningful. */
      promoValid: boolean
      percent: number | null
    }

export function priceEditorState(input: {
  classification: string
  base: number | null | undefined
  promo: number | null | undefined
}): PriceEditorState {
  if (input.classification === "BESPOKE") return { kind: "bespoke" }
  if (!input.base || input.base <= 0) return { kind: "missing" }
  const promo = input.promo && input.promo > 0 ? input.promo : null
  const promoValid = promo != null && promo < input.base
  return { kind: "set", base: input.base, promo, promoValid, percent: promoValid ? discountPercent(input.base, promo) : null }
}
