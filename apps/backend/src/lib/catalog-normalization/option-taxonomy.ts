/**
 * Catalog normalization option taxonomy (canonical labels).
 * Derived from live QA scan 2026-08-12 — not speculative.
 */

export const CANONICAL_OPTION_GROUP_LABELS = {
  material_tier: "Исполнение",
  size: "Размер",
  finish: "Отделка",
  upholstery: "Обивка",
  headboard: "Изголовье",
  frame: "Каркас",
  configuration: "Конфигурация",
} as const

/** Legacy Medusa stub option — never buyer-facing. */
export const MEDUSA_STUB_OPTION_TITLES = new Set([
  "default",
  "default variant",
  "вариант",
  "вариант 1",
  "variant",
  "variant 1",
])

export function isMedusaStubOptionTitle(title: string): boolean {
  return MEDUSA_STUB_OPTION_TITLES.has(title.trim().toLowerCase())
}

/** Synonym collapse for option group titles (case/language). */
export const OPTION_GROUP_SYNONYMS: Record<string, keyof typeof CANONICAL_OPTION_GROUP_LABELS> =
  {
    материал: "material_tier",
    material: "material_tier",
    materials: "material_tier",
    исполнение: "material_tier",
    размер: "size",
    size: "size",
    sizes: "size",
    отделка: "finish",
    цвет: "finish",
    color: "finish",
    finish: "finish",
    "paint finish": "finish",
    обивка: "upholstery",
    ткань: "upholstery",
    fabric: "upholstery",
    upholstery: "upholstery",
    изголовье: "headboard",
    headboard: "headboard",
    каркас: "frame",
    frame: "frame",
    конфигурация: "configuration",
    configuration: "configuration",
  }

export function canonicalizeOptionGroupKey(
  raw: string
): keyof typeof CANONICAL_OPTION_GROUP_LABELS | null {
  const key = raw.trim().toLowerCase()
  return OPTION_GROUP_SYNONYMS[key] ?? null
}

/** Stable buyer-facing option axis order (semantic). */
export const BUYER_OPTION_AXIS_ORDER = [
  "material_tier",
  "size",
  "finish",
  "upholstery",
  "headboard",
  "frame",
  "configuration",
] as const
