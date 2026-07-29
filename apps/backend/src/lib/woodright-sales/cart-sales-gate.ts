import { buildBuyerPurchaseContract } from "./buyer-purchase-contract"
import type { ProductClassificationType, SalesMode, SalesModifier } from "./sales-modes"

export type CartSalesGate =
  | { allow: true }
  | {
      allow: false
      status: 400 | 500
      code: string
      message: string
    }

/**
 * Authoritative cart gate: classification fail-closed + sales mode constraints.
 * Preserves BESPOKE_NOT_ALLOWED_IN_CART / PRODUCT_TYPE_VALIDATION_FAILED codes.
 */
export function evaluateCartSalesGate(input: {
  classification?: ProductClassificationType | string | null
  sales_mode?: SalesMode | null
  modifiers?: SalesModifier[]
  launch_mode?: string | null
  inventory_quantity?: number | null
  configuration_complete?: boolean
}): CartSalesGate {
  const classificationType = input.classification
  if (
    !classificationType ||
    typeof classificationType !== "string" ||
    !["STANDARD", "CONFIGURABLE", "BESPOKE"].includes(classificationType)
  ) {
    return {
      allow: false,
      status: 500,
      code: "PRODUCT_TYPE_VALIDATION_FAILED",
      message: "Unable to validate product type for cart operation.",
    }
  }
  if (classificationType === "BESPOKE") {
    return {
      allow: false,
      status: 400,
      code: "BESPOKE_NOT_ALLOWED_IN_CART",
      message:
        "BESPOKE products cannot be added to cart. Use the quote request form instead.",
    }
  }

  const contract = buildBuyerPurchaseContract({
    sales_mode: input.sales_mode ?? null,
    modifiers: input.modifiers,
    classification: classificationType as ProductClassificationType,
    launch_mode: input.launch_mode,
    inventory_quantity: input.inventory_quantity,
    configuration_complete: input.configuration_complete,
  })

  if (contract.purchase_flow !== "cart" || !contract.can_purchase) {
    return {
      allow: false,
      status: 400,
      code: contract.reason_code ?? "SALES_MODE_NOT_PURCHASABLE",
      message: "Этот товар нельзя добавить в корзину в текущем режиме продажи",
    }
  }

  return { allow: true }
}
