/**
 * Storefront RoomSet detail: PDP links from canonical product.handle.
 *
 *   node_modules/.bin/tsx src/app/rooms/room-set-detail-pdp-links.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const page = readFileSync(resolve(__dirname, "[slug]/page.tsx"), "utf8")
const copy = readFileSync(
  resolve(__dirname, "../../lib/woodright-copy.ts"),
  "utf8"
)

assert.match(page, /productHref/)
assert.match(page, /\/product\/\$\{encodeURIComponent\(handle\)\}/)
assert.match(page, /product\?\.handle/)
assert.match(page, /room-set-item-link/)
assert.match(page, /data-product-handle/)
assert.match(page, /roomSetDetail\.openProduct/)
assert.match(page, /aria-label=\{roomSetProductLinkAriaLabel\(title\)\}/)
assert.match(page, /alt=\{roomSetProductThumbAlt\(title\)\}/)
assert.match(copy, /openProduct:\s*"Открыть товар"/)

// Must not invent handles from SKU/title/slug/id
assert.doesNotMatch(page, /sku\s*\?\s*\./i)
assert.doesNotMatch(page, /\/product\/\$\{[^}]*\.id/)
assert.doesNotMatch(page, /slugToHandle|titleToHandle/)

// Composition rows use one Link each — no nested Link inside room-set-item-link
assert.doesNotMatch(
  page,
  /className="room-set-item-link"[\s\S]*?<Link/,
  "must not nest Link inside composition product link"
)

console.log("room-set-detail-pdp-links.fidelity.test.ts: ok")
