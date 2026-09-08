/**
 * Pure contract for the catalog Promotion Window slot.
 * No Medusa runtime imports - unit-testable with plain objects.
 */

export const CATALOG_MAIN_SLOT_KEY = "catalog_main"

export const ROTATION_INTERVAL_MIN_MS = 6000
export const ROTATION_INTERVAL_MAX_MS = 8000
export const ROTATION_INTERVAL_DEFAULT_MS = 7000

/** Hard cap - the card is one cell; a long rotation list is not a carousel. */
export const PROMOTION_SLOT_MAX_PRODUCTS = 6

export const PROMOTION_SLOT_LABEL_MAX_LENGTH = 40

export type PromotionSlotRecord = {
  id: string
  key: string
  enabled: boolean
  label: string | null
  product_ids: unknown
  starts_at: Date | string | null
  ends_at: Date | string | null
  rotation_interval_ms: number
  created_at?: Date | string
  updated_at?: Date | string
}

export type PromotionSlotUpdateInput = {
  enabled?: boolean
  label?: string | null
  product_ids?: string[]
  starts_at?: string | Date | null
  ends_at?: string | Date | null
  rotation_interval_ms?: number
}

export type NormalizedPromotionSlot = {
  enabled: boolean
  label: string | null
  product_ids: string[]
  starts_at: Date | null
  ends_at: Date | null
  rotation_interval_ms: number
}

export class PromotionSlotValidationError extends Error {
  readonly field: string
  constructor(field: string, message: string) {
    super(message)
    this.name = "PromotionSlotValidationError"
    this.field = field
  }
}

export function normalizeProductIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of value) {
    if (typeof raw !== "string") continue
    const id = raw.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function clampRotationInterval(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : value
  if (typeof n !== "number" || !Number.isFinite(n)) {
    return ROTATION_INTERVAL_DEFAULT_MS
  }
  return Math.min(
    ROTATION_INTERVAL_MAX_MS,
    Math.max(ROTATION_INTERVAL_MIN_MS, Math.round(n))
  )
}

function toDateOrNull(value: unknown, field: string): Date | null {
  if (value == null || value === "") return null
  const d = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(d.getTime())) {
    throw new PromotionSlotValidationError(field, `Invalid date for ${field}`)
  }
  return d
}

/**
 * Merge partial input over the existing record and validate.
 * Throws PromotionSlotValidationError on invalid combinations.
 */
export function normalizePromotionSlotInput(
  input: PromotionSlotUpdateInput,
  existing: PromotionSlotRecord | null
): NormalizedPromotionSlot {
  const enabled =
    typeof input.enabled === "boolean"
      ? input.enabled
      : Boolean(existing?.enabled)

  let label: string | null
  if (input.label === undefined) {
    label = existing?.label ?? null
  } else if (input.label == null) {
    label = null
  } else {
    const trimmed = String(input.label).trim()
    if (trimmed.length > PROMOTION_SLOT_LABEL_MAX_LENGTH) {
      throw new PromotionSlotValidationError(
        "label",
        `Label must be at most ${PROMOTION_SLOT_LABEL_MAX_LENGTH} characters`
      )
    }
    label = trimmed || null
  }

  const product_ids =
    input.product_ids === undefined
      ? normalizeProductIds(existing?.product_ids)
      : normalizeProductIds(input.product_ids)
  if (product_ids.length > PROMOTION_SLOT_MAX_PRODUCTS) {
    throw new PromotionSlotValidationError(
      "product_ids",
      `At most ${PROMOTION_SLOT_MAX_PRODUCTS} products in the promotion slot`
    )
  }

  const starts_at =
    input.starts_at === undefined
      ? toDateOrNull(existing?.starts_at ?? null, "starts_at")
      : toDateOrNull(input.starts_at, "starts_at")
  const ends_at =
    input.ends_at === undefined
      ? toDateOrNull(existing?.ends_at ?? null, "ends_at")
      : toDateOrNull(input.ends_at, "ends_at")
  if (starts_at && ends_at && ends_at.getTime() <= starts_at.getTime()) {
    throw new PromotionSlotValidationError(
      "ends_at",
      "ends_at must be after starts_at"
    )
  }

  const rotation_interval_ms =
    input.rotation_interval_ms === undefined
      ? clampRotationInterval(existing?.rotation_interval_ms)
      : clampRotationInterval(input.rotation_interval_ms)

  return { enabled, label, product_ids, starts_at, ends_at, rotation_interval_ms }
}

/** Slot presentation window check (price-list schedule is checked separately). */
export function isSlotWithinSchedule(
  slot: Pick<PromotionSlotRecord, "starts_at" | "ends_at">,
  now: Date = new Date()
): boolean {
  const t = now.getTime()
  if (slot.starts_at) {
    const s = new Date(slot.starts_at).getTime()
    if (!Number.isNaN(s) && s > t) return false
  }
  if (slot.ends_at) {
    const e = new Date(slot.ends_at).getTime()
    if (!Number.isNaN(e) && e <= t) return false
  }
  return true
}
