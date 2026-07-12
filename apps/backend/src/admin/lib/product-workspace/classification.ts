import type { AdminProductPayload, ClassificationView } from "./types"

const LABELS: Record<string, string> = {
  STANDARD: "Готовый",
  CONFIGURABLE: "Настраиваемый",
  BESPOKE: "На заказ",
}

/**
 * Source of truth: linked ProductClassification.
 * Prefers snake `product_classification`; accepts camel `productClassification` from Admin graph.
 * Never infer from title, images, variant count, or legacy `productType` joiner.
 */
export function buildClassificationView(
  product: Pick<AdminProductPayload, "productClassification" | "product_classification">
): ClassificationView {
  const raw =
    product.product_classification?.product_type ??
    product.productClassification?.product_type ??
    null

  if (raw === "STANDARD" || raw === "CONFIGURABLE" || raw === "BESPOKE") {
    return {
      code: raw,
      label: LABELS[raw],
      warning: null,
      source: "product_classification.product_type",
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
