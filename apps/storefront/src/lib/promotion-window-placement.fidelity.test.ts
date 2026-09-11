/**
 * Promotion Window placement contract: a separate right-gutter window, never a
 * grid cell. Run: `yarn tsx src/lib/promotion-window-placement.fidelity.test.ts`
 * from apps/storefront.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  PROMOTION_WINDOW_MIN_VIEWPORT,
  shouldShowPromotionWindow,
} from "./promotion-window-placement"
import type { PromotionSlotPayload } from "./api/promotion-slot"

const slot: PromotionSlotPayload = {
  slot: {
    id: "ps_1",
    key: "catalog_main",
    label: null,
    rotation_interval_ms: 7000,
    updated_at: null,
  },
  items: [
    {
      product_id: "prod_a",
      sale_price: 900,
      original_price: 1000,
      discount_percent: 10,
      product: { id: "prod_a" },
    },
  ],
}

/* ---- Visibility rule ---- */
assert.equal(shouldShowPromotionWindow(slot, 12), true, "slot with items + results → shown")
assert.equal(shouldShowPromotionWindow(slot, 1), true, "shown even with a single result")
assert.equal(shouldShowPromotionWindow(slot, 0), false, "empty result set → no rail")
assert.equal(shouldShowPromotionWindow(null, 12), false, "null payload → hidden")
assert.equal(shouldShowPromotionWindow({ slot: null, items: [] }, 12), false, "disabled slot → hidden")
assert.equal(
  shouldShowPromotionWindow({ slot: slot.slot, items: [] }, 12),
  false,
  "enabled slot with 0 valid products → hidden"
)

/* ---- Structural: the grid stays products-only, the window is an <aside>
   sibling of the product area (right gutter), CSS mirrors the filter rail. ---- */
const here = path.dirname(new URL(import.meta.url).pathname)
const browse = readFileSync(
  path.join(here, "../components/catalog-browse-client.tsx"),
  "utf8"
)
const controls = readFileSync(
  path.join(here, "../components/catalog-filter-controls.tsx"),
  "utf8"
)
const css = readFileSync(path.join(here, "../app/globals.css"), "utf8")

assert.ok(
  !browse.includes("catalog-grid-promotion"),
  "PromotionCard must not be rendered as a catalog grid <li>"
)
assert.ok(
  browse.includes('className="catalog-promo-sidebar"') &&
    browse.includes("<PromotionCard slot={promotionSlot} />"),
  "PromotionCard renders inside the .catalog-promo-sidebar aside"
)
assert.ok(browse.includes("sideRail={promotionWindow}"), "aside is passed as CatalogFilterControls sideRail")
assert.ok(
  /<div className="catalog-product-area">\{children\}<\/div>\s*\{sideRail\}/.test(controls),
  "sideRail is a sibling right after the product area inside .catalog-filter-layout"
)

const railRule = css.match(/\.catalog-promo-sidebar\s*\{[^}]*\}/g) ?? []
assert.ok(
  railRule.some((r) => /display:\s*none/.test(r)),
  "rail hidden by default (no gutter → no window)"
)
/* The visible rail rules must live INSIDE the ≥PROMOTION_WINDOW_MIN_VIEWPORT media block (a top-level
   `.catalog-promo-sidebar { position: absolute }` would show it everywhere). */
const mediaOpen = `@media (min-width: ${PROMOTION_WINDOW_MIN_VIEWPORT}px) {`
/* Several blocks share this breakpoint (the filter rail leaves the content
   area at the same width): pick the one that styles the promo rail. */
let mediaStart = -1
let mediaEnd = -1
for (let at = css.indexOf(mediaOpen); at >= 0; at = css.indexOf(mediaOpen, at + 1)) {
  const end = css.indexOf("\n}\n", at)
  if (end > at && css.slice(at, end).includes(".catalog-promo-sidebar")) {
    mediaStart = at
    mediaEnd = end
    break
  }
}
assert.ok(mediaStart >= 0, `rail appears at ≥ ${PROMOTION_WINDOW_MIN_VIEWPORT}px (gutter card ≥ 150px)`)
assert.ok(mediaEnd > mediaStart, "media block closes")
const mediaBlock = css.slice(mediaStart, mediaEnd)
assert.ok(
  /\.catalog-promo-sidebar\s*\{[^}]*position:\s*absolute;[^}]*right:\s*calc\(-1 \* var\(--catalog-sidebar-w\) - var\(--catalog-sidebar-gap\)\)/.test(
    mediaBlock
  ),
  "inside the media block the rail hangs into the RIGHT gutter with the filter card's width formula"
)
assert.ok(
  /\.catalog-promo-panel\s*\{[^}]*position:\s*sticky;[^}]*top:\s*112px/.test(mediaBlock),
  "inside the media block the panel sticks under the header like the filter card"
)
const topLevelRail = css.match(/\n\.catalog-promo-sidebar\s*\{[^}]*\}/g) ?? []
assert.ok(
  topLevelRail.every((r) => !/position:\s*absolute/.test(r)),
  "no top-level (unconditional) absolute rail rule"
)

console.log("promotion-window-placement fidelity: OK")
