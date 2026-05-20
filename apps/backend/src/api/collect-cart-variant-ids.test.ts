/**
 * Unit tests for collectCartVariantIds (run: npx ts-node --transpile-only src/api/collect-cart-variant-ids.test.ts)
 */
import assert from "node:assert/strict"
import { collectCartVariantIds } from "./middlewares"

assert.deepEqual(collectCartVariantIds({ variant_id: "var_a", quantity: 1 }), ["var_a"])

assert.deepEqual(
  collectCartVariantIds({
    items: [
      { variant_id: "var_a", quantity: 1 },
      { variant_id: "var_b", quantity: 2 },
    ],
  }),
  ["var_a", "var_b"]
)

assert.deepEqual(
  collectCartVariantIds({
    variant_id: "var_top",
    items: [{ variant_id: "var_a", quantity: 1 }],
  }),
  ["var_top", "var_a"]
)

assert.deepEqual(
  collectCartVariantIds({
    items: [
      { variant_id: "var_a", quantity: 1 },
      { variant_id: "var_a", quantity: 1 },
    ],
  }),
  ["var_a"]
)

assert.deepEqual(collectCartVariantIds({}), [])
assert.deepEqual(collectCartVariantIds({ items: [] }), [])
assert.deepEqual(collectCartVariantIds({ items: [{ quantity: 1 }] }), [])
assert.deepEqual(collectCartVariantIds(null), [])

console.log("collectCartVariantIds: ok")
