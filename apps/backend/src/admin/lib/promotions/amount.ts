/**
 * Package E — promotion amount parsing/formatting.
 * Fixed promotion `value` uses MAJOR currency units (rubles, not kopecks) —
 * proven against @medusajs/utils promotion totals for 2.13.3. Do not reuse the
 * Package C price adapter assumptions here.
 */

export type ParseAmountSuccess = { ok: true; amount: number }
export type ParseAmountFailure = {
  ok: false
  code: "empty" | "invalid" | "negative" | "zero" | "out_of_range" | "fraction_not_allowed"
}
export type ParseAmountResult = ParseAmountSuccess | ParseAmountFailure

function normalizeNumericInput(raw: string): string {
  return raw.replace(/\u00a0/g, " ").trim().replace(/\s+/g, "").replace(",", ".")
}

/**
 * Fixed discount input in major units (e.g. "3000" or "3 000" RUB).
 * Empty string and 0 are distinguished: empty → `empty`, "0" → `zero`.
 * A zero-ruble discount is never a valid promotion.
 */
export function parseFixedAmountInput(raw: string): ParseAmountResult {
  const trimmed = raw.replace(/\u00a0/g, " ").trim()
  if (!trimmed) return { ok: false, code: "empty" }
  const normalized = normalizeNumericInput(trimmed)
  if (/[.]/.test(normalized)) {
    // RUB promotions operate in whole rubles; kopecks are not accepted.
    if (!/^-?\d+(\.\d+)?$/.test(normalized)) return { ok: false, code: "invalid" }
    return { ok: false, code: "fraction_not_allowed" }
  }
  if (!/^-?\d+$/.test(normalized)) return { ok: false, code: "invalid" }
  const amount = Number(normalized)
  if (!Number.isFinite(amount)) return { ok: false, code: "invalid" }
  if (amount < 0) return { ok: false, code: "negative" }
  if (amount === 0) return { ok: false, code: "zero" }
  return { ok: true, amount }
}

/**
 * Percentage input: 0 < n <= 100, fractions allowed ("12.5" / "12,5").
 * Empty and 0 are distinguished (`empty` vs `zero`).
 */
export function parsePercentInput(raw: string): ParseAmountResult {
  const trimmed = raw.replace(/\u00a0/g, " ").trim().replace(/%$/, "").trim()
  if (!trimmed) return { ok: false, code: "empty" }
  const normalized = normalizeNumericInput(trimmed)
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return { ok: false, code: "invalid" }
  const value = Number(normalized)
  if (!Number.isFinite(value)) return { ok: false, code: "invalid" }
  if (value < 0) return { ok: false, code: "negative" }
  if (value === 0) return { ok: false, code: "zero" }
  if (value > 100) return { ok: false, code: "out_of_range" }
  return { ok: true, amount: value }
}

export function formatFixedAmount(amount: number, currency_code?: string | null): string {
  const code = (currency_code ?? "rub").trim().toUpperCase() || "RUB"
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${amount} ${code}`
  }
}

export function formatPercent(value: number): string {
  const rounded = Number.isInteger(value) ? String(value) : String(value).replace(".", ",")
  return `${rounded}%`
}

export const AMOUNT_ERROR_COPY: Record<ParseAmountFailure["code"], string> = {
  empty: "Укажите значение скидки",
  invalid: "Введите число без букв и символов",
  negative: "Скидка не может быть отрицательной",
  zero: "Скидка не может быть нулевой",
  out_of_range: "Процент должен быть от 0 до 100 включительно",
  fraction_not_allowed: "Укажите целое число рублей, без копеек",
}
