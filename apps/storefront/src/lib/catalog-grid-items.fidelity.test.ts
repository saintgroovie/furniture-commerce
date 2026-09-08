/**
 * Promotion Window grid placement rule.
 * Run: `yarn tsx src/lib/catalog-grid-items.fidelity.test.ts` from apps/storefront
 */
import assert from "node:assert/strict"
import {
  buildCatalogGridItems,
  isDefaultCatalogView,
  PROMOTION_SLOT_INDEX,
  shouldShowPromotion,
} from "./catalog-grid-items"
import type { PromotionSlotPayload } from "./api/promotion-slot"
import type { DisplayEntry } from "./display-group"
import type { CatalogFilterState } from "./catalog-filters"

const DEFAULT: CatalogFilterState = { category: [], collection: [] }

function entries(n: number): DisplayEntry[] {
  return Array.from({ length: n }, (_, i) => ({ product: { id: `p-${i + 1}` } }))
}

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

// Desktop = 3 columns → promo at DOM index 2 (last cell of row one)
assert.equal(PROMOTION_SLOT_INDEX, 2)

// Full first row: products at 0,1 then promo, then rest. Stable keys.
{
  const items = buildCatalogGridItems(entries(6), slot, DEFAULT)
  assert.equal(items.length, 7)
  assert.deepEqual(
    items.map((i) => i.kind),
    ["product", "product", "promotion", "product", "product", "product", "product"]
  )
  assert.equal(items[2]!.key, "promotion:ps_1")
  assert.deepEqual(
    items.filter((i) => i.kind === "product").map((i) => i.key),
    ["p-1", "p-2", "p-3", "p-4", "p-5", "p-6"]
  )
  // priorityHero stays with the first *product*
  const first = items[0]
  assert.equal(first.kind === "product" && first.productIndex, 0)
}

// Short result set: no placeholder cards, promo goes last
{
  const items = buildCatalogGridItems(entries(1), slot, DEFAULT)
  assert.deepEqual(items.map((i) => i.kind), ["product", "promotion"])
}

// Empty catalog result: no promo at all
assert.deepEqual(buildCatalogGridItems([], slot, DEFAULT), [])

// No backend promo → plain grid, nothing breaks
{
  const plain = buildCatalogGridItems(entries(4), null, DEFAULT)
  assert.equal(plain.length, 4)
  assert.ok(plain.every((i) => i.kind === "product"))
  const emptySlot = buildCatalogGridItems(entries(4), { slot: null, items: [] }, DEFAULT)
  assert.equal(emptySlot.length, 4)
  const noItems = buildCatalogGridItems(entries(4), { slot: slot.slot, items: [] }, DEFAULT)
  assert.equal(noItems.length, 4)
}

// Only the default main-catalog view shows the card
assert.equal(isDefaultCatalogView(DEFAULT), true)
assert.equal(isDefaultCatalogView({ ...DEFAULT, q: "комод" }), false)
assert.equal(isDefaultCatalogView({ ...DEFAULT, q: "   " }), true)
assert.equal(isDefaultCatalogView({ ...DEFAULT, category: ["dressers"] }), false)
assert.equal(isDefaultCatalogView({ ...DEFAULT, collection: ["greenwich"] }), false)
assert.equal(isDefaultCatalogView({ ...DEFAULT, priceMin: 1000 }), false)
assert.equal(isDefaultCatalogView({ ...DEFAULT, priceMax: 1000 }), false)
assert.equal(isDefaultCatalogView({ ...DEFAULT, sort: "price_asc" as never }), false)
assert.equal(isDefaultCatalogView({ ...DEFAULT, type: "STANDARD" as never }), false)

{
  const filtered = buildCatalogGridItems(entries(6), slot, { ...DEFAULT, q: "стол" })
  assert.ok(filtered.every((i) => i.kind === "product"))
  const sorted = buildCatalogGridItems(entries(6), slot, {
    ...DEFAULT,
    sort: "price_asc" as never,
  })
  assert.ok(sorted.every((i) => i.kind === "product"))
}

assert.equal(shouldShowPromotion(slot, DEFAULT, 5), true)
assert.equal(shouldShowPromotion(slot, DEFAULT, 0), false)
assert.equal(shouldShowPromotion(null, DEFAULT, 5), false)

console.log("catalog-grid-items.fidelity.test.ts: ok")
