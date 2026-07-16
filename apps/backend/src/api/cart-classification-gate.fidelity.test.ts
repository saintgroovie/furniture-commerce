/**
 * Synthetic BESPOKE / fail-closed gate (no DB fixture).
 *
 * Run from apps/backend:
 *   yarn dlx tsx src/api/cart-classification-gate.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { evaluateCartClassificationGate } from "./cart-classification-gate"

assert.deepEqual(
  evaluateCartClassificationGate({
    product_classification: { product_type: "STANDARD" },
  }),
  { allow: true }
)
assert.deepEqual(
  evaluateCartClassificationGate({
    product_classification: { product_type: "CONFIGURABLE" },
  }),
  { allow: true }
)
assert.deepEqual(evaluateCartClassificationGate(undefined), {
  allow: false,
  status: 500,
  code: "PRODUCT_TYPE_VALIDATION_FAILED",
})
assert.deepEqual(evaluateCartClassificationGate({}), {
  allow: false,
  status: 500,
  code: "PRODUCT_TYPE_VALIDATION_FAILED",
})
assert.deepEqual(
  evaluateCartClassificationGate({ product_classification: {} }),
  {
    allow: false,
    status: 500,
    code: "PRODUCT_TYPE_VALIDATION_FAILED",
  }
)
assert.deepEqual(
  evaluateCartClassificationGate({
    product_classification: { product_type: "BESPOKE" },
  }),
  {
    allow: false,
    status: 400,
    code: "BESPOKE_NOT_ALLOWED_IN_CART",
  }
)
// Kids metadata must not appear in this gate - classification alone decides.
assert.deepEqual(
  evaluateCartClassificationGate({
    product_classification: { product_type: "BESPOKE" },
    // @ts-expect-error synthetic stamp must not bypass
    metadata: { kids: true, display_group: "willie-winkie" },
  } as { product_classification?: { product_type?: string } }),
  {
    allow: false,
    status: 400,
    code: "BESPOKE_NOT_ALLOWED_IN_CART",
  }
)

console.log("cart-classification-gate.fidelity.test.ts: ok")
