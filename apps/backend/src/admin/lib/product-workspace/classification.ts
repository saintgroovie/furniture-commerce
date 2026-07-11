import type { AdminProductPayload, ClassificationView } from "./types"

const LABELS: Record<string, string> = {
  STANDARD: "Готовый",
  CONFIGURABLE: "Настраиваемый",
  BESPOKE: "На заказ",
}

/**
 * Source of truth: linked ProductType via Admin field `*productType`
 * → `product.productType.product_type`.
 * Never infer from title, images, or variant count.
 */
export function buildClassificationView(
  product: Pick<AdminProductPayload, "productType" | "product_type">
): ClassificationView {
  const raw =
    product.productType?.product_type ??
    product.product_type?.product_type ??
    null

  if (raw === "STANDARD" || raw === "CONFIGURABLE" || raw === "BESPOKE") {
    return {
      code: raw,
      label: LABELS[raw],
      warning: null,
      source: "productType.product_type",
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
