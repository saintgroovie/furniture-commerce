/** Pure cart classification gate for BESPOKE fail-closed (no DB). */

export type CartClassificationGate =
  | { allow: true }
  | { allow: false; status: 400; code: "BESPOKE_NOT_ALLOWED_IN_CART" }
  | { allow: false; status: 500; code: "PRODUCT_TYPE_VALIDATION_FAILED" }

const BESPOKE = "BESPOKE"

export function evaluateCartClassificationGate(
  product: { product_classification?: { product_type?: string } } | null | undefined
): CartClassificationGate {
  const classificationType = product?.product_classification?.product_type
  if (!product || typeof classificationType !== "string" || !classificationType) {
    return {
      allow: false,
      status: 500,
      code: "PRODUCT_TYPE_VALIDATION_FAILED",
    }
  }
  if (classificationType === BESPOKE) {
    return {
      allow: false,
      status: 400,
      code: "BESPOKE_NOT_ALLOWED_IN_CART",
    }
  }
  return { allow: true }
}
