/**
 * RoomSet detail product-row a11y (F003 Pattern A).
 *
 *   node_modules/.bin/tsx src/lib/room-set-item-a11y.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  roomSetProductLinkAriaLabel,
  roomSetProductThumbAlt,
} from "./room-set-item-a11y"

const title = "Кровать Greenwich GR-12"
assert.equal(roomSetProductLinkAriaLabel(title), `Открыть товар «${title}»`)
assert.equal(roomSetProductThumbAlt(title), title)
assert.equal(roomSetProductLinkAriaLabel("  "), "Открыть товар «Товар»")
assert.equal(roomSetProductThumbAlt(""), "Товар")

// Accessible name must not embed SKU/Medusa id patterns from helpers
const aria = roomSetProductLinkAriaLabel(title)
assert.doesNotMatch(aria, /prod_/i)
assert.doesNotMatch(aria, /greenwich-gr-12-1/)

const page = readFileSync(
  resolve(__dirname, "../app/rooms/[slug]/page.tsx"),
  "utf8"
)
assert.match(page, /roomSetProductLinkAriaLabel/)
assert.match(page, /roomSetProductThumbAlt/)
assert.match(page, /aria-label=\{roomSetProductLinkAriaLabel\(title\)\}/)
assert.match(page, /alt=\{roomSetProductThumbAlt\(title\)\}/)
assert.doesNotMatch(page, /alt=""/)
assert.doesNotMatch(page, /alt=\{product\?\.id/)
assert.doesNotMatch(page, /alt=\{product\?\.handle/)
assert.match(page, /className="room-set-item-link"/)
assert.doesNotMatch(
  page,
  /className="room-set-item-link"[\s\S]*?<Link/,
  "must not nest Link inside composition product link"
)
// Still one Link + visible open CTA copy
assert.match(page, /roomSetDetail\.openProduct/)
assert.match(page, /data-product-handle/)

// V1 product order remains exact in immutable RoomSet manifest (F002 untouched)
const manifest = readFileSync(
  resolve(__dirname, "../../../backend/src/scripts/seed-rooms-v1-manifest.ts"),
  "utf8"
)
assert.match(
  manifest,
  /slug:\s*"spalnya-greenwich"[\s\S]*?product_handles:\s*\[\s*"greenwich-gr-12-1",\s*"greenwich-gr-08-1",\s*"greenwich-gr-67-1"/
)
assert.match(
  manifest,
  /slug:\s*"spalnya-cloud"[\s\S]*?product_handles:\s*\[\s*"greenwich-gr-12-1",\s*"greenwich-gr-67-1",\s*"greenwich-gr-02-1"/
)
assert.match(
  manifest,
  /71ef39d2699330bb2c0bca59f968bc695151b87d9ad9b7f23d9b35be0c07b67e/
)

console.log("room-set-item-a11y.fidelity.test.ts: ok")
