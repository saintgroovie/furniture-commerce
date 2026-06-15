import { TODO_OPERATOR, type MatrixRow } from "./matrix-board-types"

export const TIER_LABELS = {
  solid_full: "Полностью массив",
  solid_front_ldsp_body: "Фронты массив + боковины/задники ЛДСП",
} as const

export const TIER_FIELD_KEYS = [
  "solid_full_price_rub",
  "solid_front_ldsp_body_price_rub",
] as const

export type TierFieldKey = (typeof TIER_FIELD_KEYS)[number]

export function isConfigurableRow(row: MatrixRow): boolean {
  return row.medusa_product_type === "CONFIGURABLE"
}

export function isBlankTierValue(v: string | undefined): boolean {
  const s = (v ?? "").trim()
  return !s || s === TODO_OPERATOR
}

export function parsePositivePrice(v: string | undefined): number | null {
  if (isBlankTierValue(v)) return null
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}
