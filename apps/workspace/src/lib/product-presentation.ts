import type { StateView } from "./state"

export type ProductLike = {
  title: string
  status: string
  classification: string
  kids_nav?: boolean
  readiness: { published: boolean; visible: boolean; has_price: boolean; has_media: boolean }
  publish?: { ready: boolean; blockers: Array<{ code: string; message: string }>; warnings?: Array<{ code: string; message: string }> } | null
  dimensions?: { height_mm?: number; width_mm?: number; depth_mm?: number } | null
}

export function classificationLabel(classification: string): string {
  switch (classification) {
    case "STANDARD":
      return "Обычный"
    case "CONFIGURABLE":
      return "С вариантами"
    case "BESPOKE":
      return "По проекту"
    default:
      return "Тип не выбран"
  }
}

export type ChecklistItem = { code: string; label: string; ok: boolean; note?: string }

/**
 * Backend readiness → human checklist. Each line maps to backend blocker codes;
 * nothing is recomputed on the client.
 */
export function readinessChecklist(product: ProductLike): ChecklistItem[] {
  const blockers = new Set((product.publish?.blockers ?? []).map((item) => item.code))
  const warnings = new Set((product.publish?.warnings ?? []).map((item) => item.code))
  const bespoke = product.classification === "BESPOKE"
  const items: ChecklistItem[] = [
    { code: "title", label: "Название", ok: !blockers.has("missing_title") },
    { code: "classification", label: "Тип продажи", ok: !blockers.has("missing_classification") },
    { code: "collection", label: "Коллекция", ok: !blockers.has("missing_collection") && !blockers.has("invalid_collection") },
    { code: "sku", label: "Артикул", ok: !blockers.has("missing_sku") },
    bespoke
      ? { code: "price", label: "Обычная цена", ok: true, note: "не требуется для товара по проекту" }
      : { code: "price", label: "Обычная цена", ok: !blockers.has("missing_price") && product.readiness.has_price },
    { code: "media", label: "Главное изображение", ok: !blockers.has("missing_media") && product.readiness.has_media },
  ]
  if (warnings.has("missing_dimensions")) {
    items.push({ code: "dimensions", label: "Размеры", ok: false, note: "предупреждение, публикации не мешает" })
  }
  if (warnings.has("missing_execution_setup")) {
    items.push({ code: "execution", label: "Исполнения", ok: false, note: "предупреждение для товара с вариантами" })
  }
  return items
}

export type ProductPrimaryAction =
  | { kind: "price"; label: string; anchor: "#price" }
  | { kind: "media"; label: string; anchor: "#media" }
  | { kind: "publish"; label: string; anchor: "#publish" }
  | { kind: "blocked"; label: string; anchor: "#publish"; reason: string }
  | { kind: "published"; label: string; anchor: "#publish" }

/**
 * Variable primary action. Published products never get «Опубликовать» again.
 * Order of blockers follows the real workflow: price → image → publish.
 */
export function primaryProductAction(product: ProductLike): ProductPrimaryAction {
  const published = product.status === "published"
  if (published) return { kind: "published", label: "Посмотреть на сайте", anchor: "#publish" }
  const bespoke = product.classification === "BESPOKE"
  if (!bespoke && !product.readiness.has_price) return { kind: "price", label: "Задать цену", anchor: "#price" }
  if (!product.readiness.has_media) return { kind: "media", label: "Добавить изображение", anchor: "#media" }
  if (product.publish?.ready) return { kind: "publish", label: "Опубликовать", anchor: "#publish" }
  const first = product.publish?.blockers?.[0]
  return {
    kind: "blocked",
    label: "Проверить готовность",
    anchor: "#publish",
    reason: first?.message ?? "Пока нельзя опубликовать",
  }
}

export function publicationState(product: ProductLike): StateView {
  if (product.status === "published" && product.readiness.visible) return { tone: "positive", label: "На витрине" }
  if (product.status === "published") return { tone: "attention", label: "Опубликован, покупатель не видит" }
  if (product.publish?.ready) return { tone: "positive", label: "Готов к публикации" }
  return { tone: "neutral", label: "Черновик" }
}

/** One problem line for the list row. Null when nothing blocks the card. */
export function productProblem(product: ProductLike): StateView | null {
  const bespoke = product.classification === "BESPOKE"
  if (!bespoke && !product.readiness.has_price) return { tone: "critical", label: "Нет цены" }
  if (!product.readiness.has_media) return { tone: "attention", label: "Нет фото" }
  if (product.status === "published" && !product.readiness.visible) return { tone: "attention", label: "Покупатель не видит" }
  const blocker = product.publish?.blockers?.[0]
  if (blocker && product.status !== "published") return { tone: "attention", label: blocker.message }
  return null
}

export function readinessSummary(items: ChecklistItem[]): { done: number; total: number } {
  const required = items.filter((item) => !item.note || item.ok)
  return { done: required.filter((item) => item.ok).length, total: required.length }
}

export function toCm(mm: number | undefined | null): string {
  if (!mm || !Number.isFinite(mm)) return ""
  const cm = mm / 10
  return Number.isInteger(cm) ? String(cm) : String(Math.round(cm * 10) / 10)
}
