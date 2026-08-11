/**
 * Runtime classification + BESPOKE cart guard contract (source fidelity).
 *
 * Run from apps/backend:
 *   node_modules/.bin/tsx src/api/middlewares.classification-compat.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const middlewareSrc = readFileSync(join(root, "src/api/middlewares.ts"), "utf8")
const modelSrc = readFileSync(
  join(root, "src/modules/product-extension/models/product-type.ts"),
  "utf8"
)
const serviceSrc = readFileSync(
  join(root, "src/modules/product-extension/service.ts"),
  "utf8"
)
const linkSrc = readFileSync(
  join(root, "src/links/product-product-extension.ts"),
  "utf8"
)

assert.match(
  modelSrc,
  /export const ProductClassification = model\.define\("product_classification"/
)
assert.doesNotMatch(modelSrc, /model\.define\("product_type"/)
assert.match(serviceSrc, /ProductClassification/)
assert.doesNotMatch(serviceSrc, /\bProductType\b/)
assert.match(linkSrc, /linkable\.productClassification/)
assert.doesNotMatch(linkSrc, /linkable\.productType/)

assert.match(middlewareSrc, /product_classification\.product_type/)
assert.match(middlewareSrc, /product_sales_policy\.\*/)
assert.match(middlewareSrc, /BESPOKE_NOT_ALLOWED_IN_CART/)
assert.match(middlewareSrc, /PRODUCT_TYPE_VALIDATION_FAILED/)
assert.match(middlewareSrc, /evaluateCartSalesGate/)
assert.match(
  middlewareSrc,
  /from ["']\.\.\/lib\/woodright-sales\/cart-sales-gate["']/
)
assert.doesNotMatch(middlewareSrc, /productType\.\*/)
assert.match(middlewareSrc, /for \(const variantId of variantIds\)/)

const gateSrc = readFileSync(
  join(root, "src/api/cart-classification-gate.ts"),
  "utf8"
)
assert.match(gateSrc, /BESPOKE_NOT_ALLOWED_IN_CART/)
assert.match(gateSrc, /PRODUCT_TYPE_VALIDATION_FAILED/)
assert.match(gateSrc, /export function evaluateCartClassificationGate/)

console.log("middlewares.classification-compat.fidelity.test.ts: ok")
