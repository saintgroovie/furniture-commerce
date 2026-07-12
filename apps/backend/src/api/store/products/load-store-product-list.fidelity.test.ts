/**
 * Browse loader field contract (latency split: no nested price_set/images).
 *
 *   node_modules/.bin/tsx src/api/store/products/load-store-product-list.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { BROWSE_PRODUCT_FIELDS } from "./load-store-product-list"

assert.ok(BROWSE_PRODUCT_FIELDS.includes("variants.id"))
assert.ok(BROWSE_PRODUCT_FIELDS.includes("variants.sku"))
assert.ok(BROWSE_PRODUCT_FIELDS.includes("thumbnail"))
assert.equal(
  BROWSE_PRODUCT_FIELDS.includes("variants.price_set.prices.amount"),
  false,
  "browse product graph must not nest price_set (batched separately)"
)
assert.equal(
  BROWSE_PRODUCT_FIELDS.includes("images.url"),
  false,
  "browse product graph must not load images (thumbnail covers cards)"
)

console.log("load-store-product-list.fidelity.test.ts: ok")
