import type { AdminProductPayload, ClassificationView } from "./types"

const LABELS: Record<string, string> = {
  STANDARD: "Готовый",
  CONFIGURABLE: "Настраиваемый",
  BESPOKE: "На заказ",
}

/**
 * Source of truth: linked ProductClassification via Admin field `*productClassification`
 * → `product.productClassification.product_type` (snake: product_classification).
 * Never infer from title, images, or variant count.
 */
export function buildClassificationView(
  product: Pick<
    AdminProductPayload,
    "productClassification" | "product_classification" | "productType" | "product_type"
  >
): ClassificationView {
  const raw =
    product.productClassification?.product_type ??
    product.product_classification?.product_type ??
    product.productType?.product_type ??
    product.product_type?.product_type ??
    null

  if (raw === "STANDARD" || raw === "CONFIGURABLE" || raw === "BESPOKE") {
    return {
      code: raw,
      label: LABELS[raw],
      warning: null,
      source: "productClassification.product_type",
    }
  }

  return {
    code: null,
    label: "Тип не указан",
    warning:
      "У товара нет связанного типа Woodright (STANDARD / CONFIGURABLE / BESPOKE). Данные не изменяются автоматически.",
    source: "missing",
  }
}
