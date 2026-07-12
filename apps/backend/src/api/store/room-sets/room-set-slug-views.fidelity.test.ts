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
  /product\.variants\.id/,
  "storefront view must request variant ids for CTA"
)
assert.match(
  src,
  /product\.title/,
  "storefront view must keep titles for composition list"
)
assert.match(
  src,
  /product\.\*|product\.variants\.\*/,
  "default detail must keep full product/variants projection"
)

console.log("room-set-slug-views.fidelity.test.ts: ok")
