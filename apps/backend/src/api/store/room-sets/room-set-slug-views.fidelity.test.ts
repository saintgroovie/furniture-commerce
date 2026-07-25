/**
 * RoomSet slug views: default full, product_ids lean, storefront lean.
 *
 *   node_modules/.bin/tsx src/api/store/room-sets/room-set-slug-views.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const src = readFileSync(resolve(__dirname, "[slug]/route.ts"), "utf8")

assert.match(src, /PRODUCT_IDS_VIEW\s*=\s*"product_ids"/)
assert.match(src, /STOREFRONT_VIEW\s*=\s*"storefront"/)
assert.match(src, /view === STOREFRONT_VIEW/)
assert.match(
  src,
  /exactlyOneProduct/,
  "must fail-closed normalize products[] → singular product"
)
assert.match(
  src,
  /missing product link/,
  "zero product links must fail closed"
)
assert.match(
  src,
  /products\.variants\.id/,
  "storefront view must request variant ids via products[] graph link"
)
assert.match(
  src,
  /products\.title/,
  "storefront view must keep titles for composition list"
)
assert.match(
  src,
  /products\.\*|products\.variants\.\*/,
  "default detail must keep full products/variants projection"
)
assert.doesNotMatch(
  src,
  /fields:\s*\[[^\]]*"[*]".*"product\.\*"/s,
  "must not query singular product.* on room_set_item (empty under current link)"
)

console.log("room-set-slug-views.fidelity.test.ts: ok")
