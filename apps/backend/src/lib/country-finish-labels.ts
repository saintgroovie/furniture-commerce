/**
 * Country (co-*) finish color labels for catalog metadata.
 * Business rule: neutral/cream bucket → «Молочный», not raw token or «Кремовый».
 * Mirrors assign-prefill + legacy board neutral-gallery rules.
 */

export const COUNTRY_FINISH_LABELS: Record<string, string> = {
  blue: "Голубой",
  grey: "Серый",
  gray: "Серый",
  olive: "Оливковый",
  white: "Белый",
  cream: "Молочный",
  milk: "Молочный",
  molochny: "Молочный",
  beige: "Бежевый",
  black: "Чёрный",
  brown: "Коричневый",
  graphite: "Графит",
  ivory: "Слоновая кость",
  torno: "Торно",
  green: "Зелёный",
}

const RAW_TOKEN_RE = /^[a-z][a-z0-9_-]*$/i

export function isCountryHandle(handle: string): boolean {
  return handle.trim().toLowerCase().startsWith("co-")
}

/** Resolve buyer-facing RU label for Country finish execution metadata. */
export function countryFinishLabel(
  handle: string,
  variantKey: string,
  operatorLabel?: string | null
): string {
  const key = variantKey.trim().toLowerCase()

  if (isCountryHandle(handle) && isMilkLikeFinishKey(key, operatorLabel)) {
    return COUNTRY_FINISH_LABELS.milk
  }

  const fromOperator = operatorLabel?.trim()
  if (fromOperator && !isRawFinishTokenLabel(fromOperator, variantKey)) {
    return fromOperator
  }

  if (!isCountryHandle(handle)) {
    return COUNTRY_FINISH_LABELS[key] ?? variantKey
  }

  return COUNTRY_FINISH_LABELS[key] ?? variantKey
}

/** True when label looks like an unresolved internal token (e.g. "cream", "blue"). */
export function isRawFinishTokenLabel(label: string, variantKey: string): boolean {
  const l = label.trim()
  if (!l) return true
  if (l === variantKey) return true
  return RAW_TOKEN_RE.test(l) && l.toLowerCase() === variantKey.toLowerCase()
}

export function normalizeCountryFinishExecutions<T extends { key: string; label: string }>(
  handle: string,
  executions: T[],
  labelOverrides?: Record<string, string>
): T[] {
  return executions.map((ex) => {
    const override = labelOverrides?.[ex.key]
    const label = countryFinishLabel(handle, ex.key, override ?? ex.label)
    return { ...ex, label }
  })
}

export function normalizeCountryFinishLabelMap(
  handle: string,
  labels: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(labels)) {
    out[key] = countryFinishLabel(handle, key, value)
  }
  return out
}

const MILK_LIKE_KEYS = new Set(["cream", "milk", "molochny", "ivory"])

/** Country neutral / milk-like finish bucket (board + catalog default). */
export function isMilkLikeFinishKey(variantKey: string, label?: string | null): boolean {
  const key = variantKey.trim().toLowerCase()
  if (MILK_LIKE_KEYS.has(key)) return true
  const hay = `${key} ${label ?? ""}`.toLowerCase()
  return /молоч|milk|molochn|сливоч/i.test(hay)
}

export function sortCountryFinishExecutionsMilkFirst<
  T extends { key: string; label: string },
>(executions: T[]): T[] {
  return [...executions].sort((a, b) => {
    const aMilk = isMilkLikeFinishKey(a.key, a.label)
    const bMilk = isMilkLikeFinishKey(b.key, b.label)
    if (aMilk && !bMilk) return -1
    if (!aMilk && bMilk) return 1
    return a.key.localeCompare(b.key)
  })
}

type FinishExecutionLike = { key: string; label: string; urls?: string[] }

function executionKeysSignature(executions: FinishExecutionLike[] | null | undefined): string {
  if (!Array.isArray(executions)) return ""
  return executions
    .map((e) => e.key)
    .sort()
    .join("\u0000")
}

/** True when legacy `paint_finish_executions` shadows canonical `finish_color_executions`. */
export function isStalePaintFinishMetadata(meta: Record<string, unknown>): boolean {
  const finish = meta.finish_color_executions as FinishExecutionLike[] | undefined
  const paint = meta.paint_finish_executions as FinishExecutionLike[] | undefined
  if (!Array.isArray(finish) || finish.length < 2) return false
  if (!Array.isArray(paint) || paint.length === 0) return true
  return executionKeysSignature(finish) !== executionKeysSignature(paint)
}

/**
 * Keep legacy paint_finish_* in sync with finish_color_* (storefront used to prefer paint first).
 * Medusa ignores `delete` on metadata merge — use null to clear stale keys.
 */
export function syncCountryPaintFinishMetadata(meta: Record<string, unknown>): boolean {
  const finish = meta.finish_color_executions
  if (!Array.isArray(finish) || finish.length < 2) return false
  const labels = meta.finish_color_labels
  meta.paint_finish_executions = finish
  if (labels && typeof labels === "object" && !Array.isArray(labels)) {
    meta.paint_finish_labels = labels
  } else {
    meta.paint_finish_labels = null
  }
  return true
}
