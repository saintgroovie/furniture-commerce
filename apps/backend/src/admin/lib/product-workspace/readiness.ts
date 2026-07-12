import type { ClassificationView, MediaSummaryView, PriceSummaryView } from "./types"
import type { ProductWorkspaceTabId } from "./types"

export type ReadinessSeverity = "must" | "should"

export type ReadinessCta =
  | { kind: "field"; field: "title" | "description"; label: string }
  | { kind: "tab"; tab: Extract<ProductWorkspaceTabId, "variants" | "gallery">; label: string }
  | { kind: "stock"; label: string }
  | { kind: "none" }

export type ReadinessItem = {
  id: string
  severity: ReadinessSeverity
  ok: boolean
  unverifiable?: boolean
  label: string
  detail?: string
  cta: ReadinessCta
}

export type ProductReadinessVM = {
  items: ReadinessItem[]
  must_open: number
  should_open: number
  verification: "ready" | "needs_fixes" | "unverified"
  summary_label: string
}

export type BuildProductReadinessInput = {
  title: string
  description: string
  classification: Pick<ClassificationView, "code" | "label">
  variantCount: number
  variantsTruncated: boolean
  prices: Pick<PriceSummaryView, "variants_without_price" | "label">
  media: Pick<MediaSummaryView, "has_thumbnail" | "image_count">
}

/**
 * Loop 2 — publish readiness from already-loaded workspace data.
 * Derived indicator only; does not save or imply publication.
 */
export function buildProductReadiness(input: BuildProductReadinessInput): ProductReadinessVM {
  const titleOk = Boolean(input.title.trim())
  const descriptionOk = Boolean(input.description.trim())
  const classificationOk = Boolean(input.classification.code)
  const hasVariant = input.variantCount > 0
  const pricesUnverifiable = input.variantsTruncated
  const pricesOk =
    !pricesUnverifiable &&
    hasVariant &&
    input.prices.variants_without_price === 0 &&
    input.prices.label !== "Цена не задана"
  const thumbOk = input.media.has_thumbnail
  const galleryOk = input.media.image_count > 0

  const items: ReadinessItem[] = [
    {
      id: "title",
      severity: "must",
      ok: titleOk,
      label: "Название",
      detail: titleOk ? undefined : "Без названия товар сложно найти и показать на витрине",
      cta: { kind: "field", field: "title", label: "Заполнить название" },
    },
    {
      id: "classification",
      severity: "must",
      ok: classificationOk,
      label: "Тип товара",
      detail: classificationOk
        ? input.classification.label
        : "Тип Woodright не указан — задайте его на полной карточке",
      cta: { kind: "stock", label: "Указать тип на полной карточке" },
    },
    {
      id: "variants",
      severity: "must",
      ok: hasVariant,
      label: "Варианты",
      detail: hasVariant
        ? `Вариантов: ${input.variantCount}`
        : "Нужен хотя бы один вариант с ценой",
      cta: hasVariant
        ? { kind: "none" }
        : { kind: "stock", label: "Добавить вариант на полной карточке" },
    },
    {
      id: "prices",
      severity: "must",
      ok: pricesOk,
      unverifiable: pricesUnverifiable,
      label: "Цены",
      detail: pricesUnverifiable
        ? "Список вариантов загружен не полностью — цены не проверяем"
        : !hasVariant
          ? "Сначала нужны варианты"
          : pricesOk
            ? input.prices.label
            : input.prices.variants_without_price > 0
              ? `Вариантов без цены: ${input.prices.variants_without_price}`
              : "У вариантов нет цены",
      cta: pricesUnverifiable
        ? { kind: "tab", tab: "variants", label: "Открыть варианты и цены" }
        : pricesOk
          ? { kind: "none" }
          : { kind: "tab", tab: "variants", label: "Исправить цены" },
    },
    {
      id: "thumbnail",
      severity: "must",
      ok: thumbOk,
      label: "Главное фото",
      detail: thumbOk ? undefined : "В каталоге нужно главное фото",
      cta: thumbOk
        ? { kind: "none" }
        : { kind: "tab", tab: "gallery", label: "Добавить главное фото" },
    },
    {
      id: "description",
      severity: "should",
      ok: descriptionOk,
      label: "Описание",
      detail: descriptionOk ? undefined : "Желательно заполнить для витрины",
      cta: { kind: "field", field: "description", label: "Добавить описание" },
    },
    {
      id: "gallery",
      severity: "should",
      ok: galleryOk,
      label: "Галерея",
      detail: galleryOk
        ? `Фото в галерее: ${input.media.image_count}`
        : "Желательно добавить хотя бы одно фото в галерею",
      cta: galleryOk
        ? { kind: "none" }
        : { kind: "tab", tab: "gallery", label: "Открыть галерею" },
    },
  ]

  const mustOpen = items.filter((i) => i.severity === "must" && (!i.ok || i.unverifiable)).length
  const shouldOpen = items.filter((i) => i.severity === "should" && !i.ok).length
  const unverified = items.some((i) => i.unverifiable)

  let verification: ProductReadinessVM["verification"]
  let summary_label: string
  if (unverified) {
    verification = "unverified"
    summary_label = "Не удалось проверить"
  } else if (mustOpen > 0) {
    verification = "needs_fixes"
    summary_label = `Нужно исправить: ${mustOpen}`
  } else {
    verification = "ready"
    summary_label = "Готов к публикации"
  }

  return {
    items,
    must_open: mustOpen,
    should_open: shouldOpen,
    verification,
    summary_label,
  }
}
