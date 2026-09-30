/**
 * Buyer publication is exactly Medusa status `published`.
 *
 *   node_modules/.bin/tsx src/lib/buyer-publication.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { isBuyerPublicProductStatus } from "./buyer-publication"

assert.equal(isBuyerPublicProductStatus("published"), true)
assert.equal(isBuyerPublicProductStatus("draft"), false)
assert.equal(isBuyerPublicProductStatus("proposed"), false)
assert.equal(isBuyerPublicProductStatus(undefined), false)
assert.equal(isBuyerPublicProductStatus(null), false)

const route = readFileSync(
  join("src/api/store/products/[id]/route.ts"),
  "utf8"
)
assert.match(route, /status:\s*BUYER_PUBLIC_PRODUCT_STATUS/)
assert.match(route, /isBuyerPublicProductStatus/)
assert.match(route, /res\.status\(404\)/)

const list = readFileSync(
  join("src/api/store/products/load-store-product-list.ts"),
  "utf8"
)
assert.match(list, /status:\s*BUYER_PUBLIC_PRODUCT_STATUS/)

console.log("buyer-publication.fidelity.test.ts: ok")
