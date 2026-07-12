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
  /** Storefront-facing price hint (first variant), not the admin range. */
  buyer_price_note: string | null
}

export type BuildProductReadinessInput = {
  title: string
  description: string
  classification: Pick<ClassificationView, "code" | "label">
  variantCount: number
  variantsTruncated: boolean
  prices: Pick<PriceSummaryView, "variants_without_price" | "label">
  media: Pick<MediaSummaryView, "has_thumbnail" | "image_count">
  /** First price on first variant (storefront getPrice fallback: prices[0]). */
  firstVariantBuyerPriceLabel?: string | null
}

/**
 * Content completeness from already-loaded workspace data.
 * Does **not** mean the product is listed on the storefront — see
 * `buildStorefrontEligibility`.
 */
export function buildProductReadiness(input: BuildProductReadinessInput): ProductReadinessVM {
  const isBespoke = input.classification.code === "BESPOKE"
  const titleOk = Boolean(input.title.trim())
  const descriptionOk = Boolean(input.description.trim())
  const classificationOk = Boolean(input.classification.code)
  const hasVariant = input.variantCount > 0
  const pricesUnverifiable = input.variantsTruncated && !isBespoke
  const pricesComplete =
    !input.variantsTruncated &&
    hasVariant &&
    input.prices.variants_without_price === 0 &&
    input.prices.label !== "Цена не задана" &&
    input.prices.label !== "Нет вариантов"
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
      severity: isBespoke ? "should" : "must",
      ok: hasVariant,
      label: "Варианты",
      detail: hasVariant
        ? `Вариантов: ${input.variantCount}`
        : isBespoke
          ? "Для запроса «на заказ» вариант желателен, но покупка в корзину не требуется"
          : "Нужен хотя бы один вариант с ценой",
      cta: hasVariant
        ? { kind: "none" }
        : { kind: "stock", label: "Добавить вариант на полной карточке" },
    },
    {
      id: "prices",
      severity: isBespoke ? "should" : "must",
      ok: isBespoke ? true : pricesComplete,
      unverifiable: pricesUnverifiable,
      label: "Цены",
      detail: isBespoke
        ? "На заказ — на витрине сценарий запроса, цена в корзине не обязательна"
        : pricesUnverifiable
          ? "Список вариантов загружен не полностью — цены не проверяем"
          : !hasVariant
            ? "Сначала нужны варианты"
            : pricesComplete
              ? input.prices.label
              : input.prices.variants_without_price > 0
                ? `Вариантов без цены: ${input.prices.variants_without_price}`
                : "У вариантов нет цены",
      cta: isBespoke
        ? { kind: "none" }
        : pricesUnverifiable
          ? { kind: "tab", tab: "variants", label: "Открыть варианты и цены" }
          : pricesComplete
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
      detail: descriptionOk
        ? undefined
        : isBespoke
          ? "Для запроса «на заказ» описание желательно"
          : "Желательно заполнить для витрины",
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
    summary_label = "Карточка заполнена"
  }

  let buyer_price_note: string | null = null
  if (isBespoke) {
    buyer_price_note = "На витрине — запрос «на заказ», не цена корзины."
  } else if (input.firstVariantBuyerPriceLabel) {
    const range = input.prices.label
    buyer_price_note =
      range && range !== input.firstVariantBuyerPriceLabel
        ? `На витрине обычно цена первого варианта: ${input.firstVariantBuyerPriceLabel}. В админке диапазон: ${range}.`
        : `На витрине обычно цена первого варианта: ${input.firstVariantBuyerPriceLabel}.`
  } else if (hasVariant && !pricesUnverifiable) {
    buyer_price_note =
      "На витрине показывается цена первого варианта (calculated_price / prices[0]), не обязательно весь диапазон."
  }

  return {
    items,
    must_open: mustOpen,
    should_open: shouldOpen,
    verification,
    summary_label,
    buyer_price_note,
  }
}
