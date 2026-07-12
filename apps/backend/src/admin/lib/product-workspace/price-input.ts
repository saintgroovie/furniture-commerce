/**
 * Price input adapter — major currency units (Medusa Admin 2.13.3 fixture-proven).
 * RUB UI: integer major units, display via Intl ru-RU.
 */

export type ParsePriceSuccess = { ok: true; amount: number }
export type ParsePriceFailure = { ok: false; code: "empty" | "invalid" | "negative" | "fraction_not_allowed" }
export type ParsePriceResult = ParsePriceSuccess | ParsePriceFailure

export function formatMajorMoney(amount: number, currency_code: string): string {
  const code = currency_code.trim().toUpperCase() || "RUB"
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: code === "RUB" ? "RUB" : code,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${amount} ${code}`
  }
}

/**
 * Accepts: "12500", "12 500", "12\u00a0500", optional currency suffix stripped by caller.
 * Rejects: empty, NaN, negative, fractional (for integer-major currencies like RUB).
 */
export function parseMajorPriceInput(
  raw: string,
  options?: { allowFraction?: boolean; allowNegative?: boolean }
): ParsePriceResult {
  const trimmed = raw.replace(/\u00a0/g, " ").trim()
  if (!trimmed) return { ok: false, code: "empty" }

  let normalized = trimmed.replace(/\s+/g, "")
  // Allow either comma or dot as decimal separator only when fractions allowed
  const allowFraction = options?.allowFraction === true
  if (!allowFraction) {
    if (/[.,]/.test(normalized)) return { ok: false, code: "fraction_not_allowed" }
    if (!/^-?\d+$/.test(normalized)) return { ok: false, code: "invalid" }
  } else {
    normalized = normalized.replace(",", ".")
    if (!/^-?\d+(\.\d+)?$/.test(normalized)) return { ok: false, code: "invalid" }
  }

  const amount = Number(normalized)
  if (!Number.isFinite(amount)) return { ok: false, code: "invalid" }
  if (amount < 0 && !options?.allowNegative) return { ok: false, code: "negative" }
  if (!allowFraction && !Number.isInteger(amount)) {
    return { ok: false, code: "fraction_not_allowed" }
  }
  return { ok: true, amount }
}

export function missingVsZeroLabel(amount: number | null | undefined): "missing" | "zero" | "priced" {
  if (amount == null || !Number.isFinite(amount)) return "missing"
  if (amount === 0) return "zero"
  return "priced"
}
