/**
 * Browse loader field contract (latency split: no nested price_set; lean images.url).
 * Default PDP graph must also load option relations for the buyer variant axis.
 *
 *   node_modules/.bin/tsx src/api/store/products/load-store-product-list.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { BROWSE_PRODUCT_FIELDS } from "./load-store-product-list"

assert.ok(BROWSE_PRODUCT_FIELDS.includes("variants.id"))
assert.ok(BROWSE_PRODUCT_FIELDS.includes("variants.sku"))
assert.ok(BROWSE_PRODUCT_FIELDS.includes("thumbnail"))
assert.ok(
  BROWSE_PRODUCT_FIELDS.includes("images.url"),
  "browse product graph loads lean images.url for catalog card gallery strip"
)
assert.equal(
  BROWSE_PRODUCT_FIELDS.includes("variants.price_set.prices.amount"),
  false,
  "browse product graph must not nest price_set (batched separately)"
)

const source = readFileSync(join(process.cwd(), "src/api/store/products/load-store-product-list.ts"), "utf8")
assert.match(source, /"options\.\*"/)
assert.match(source, /"variants\.options\.\*"/)

console.log("load-store-product-list.fidelity.test.ts: ok")
