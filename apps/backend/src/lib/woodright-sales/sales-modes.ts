/** Woodright product sales modes (independent of publication + inventory). */

export const SALES_MODES = [
  "in_stock",
  "made_to_order",
  "configurable_to_order",
  "quote_required",
  "bespoke_project",
  "showroom_sample",
  "unavailable",
] as const

export type SalesMode = (typeof SALES_MODES)[number]

export const SALES_MODIFIERS = [
  "preorder",
  "only_as_set",
  "showroom_only",
  "limited_series",
  "discontinued",
  "manager_confirmation_required",
] as const

export type SalesModifier = (typeof SALES_MODIFIERS)[number]

export const SALES_MODE_OWNER_LABEL: Record<SalesMode, string> = {
  in_stock: "В наличии",
  made_to_order: "Изготавливается на заказ",
  configurable_to_order: "Изготавливается в выбранной конфигурации",
  quote_required: "Цена и срок по запросу",
  bespoke_project: "Индивидуальный проект",
  showroom_sample: "Выставочный образец",
  unavailable: "Недоступен для заказа",
}

export const SALES_MODE_CTA: Record<SalesMode, string> = {
  in_stock: "Купить",
  made_to_order: "Заказать",
  configurable_to_order: "Настроить и заказать",
  quote_required: "Запросить расчёт",
  bespoke_project: "Обсудить проект",
  showroom_sample: "Забронировать образец",
  unavailable: "Узнать о возобновлении",
}

export const SALES_MODIFIER_OWNER_LABEL: Record<SalesModifier, string> = {
  preorder: "Предзаказ",
  only_as_set: "Только в комплекте",
  showroom_only: "Только в шоуруме",
  limited_series: "Ограниченная серия",
  discontinued: "Снят с производства",
  manager_confirmation_required: "Нужно подтверждение менеджера",
}

export function isSalesMode(value: unknown): value is SalesMode {
  return typeof value === "string" && (SALES_MODES as readonly string[]).includes(value)
}

export function isSalesModifier(value: unknown): value is SalesModifier {
  return typeof value === "string" && (SALES_MODIFIERS as readonly string[]).includes(value)
}

export type ProductClassificationType = "STANDARD" | "CONFIGURABLE" | "BESPOKE"

/** Read-time compat only - never auto-writes DB. */
export function projectSalesModeFromClassification(
  classification: ProductClassificationType | null | undefined
): SalesMode | null {
  if (classification === "STANDARD") return "made_to_order"
  if (classification === "CONFIGURABLE") return "configurable_to_order"
  if (classification === "BESPOKE") return "bespoke_project"
  return null
}
