/**
 * Merchandising order must survive storefront grouping + default sort.
 *
 *   node_modules/.bin/tsx src/lib/catalog-merchandising-pipeline.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { groupProductsForDisplay } from "./display-group"
import {
  applyCatalogFilters,
  sortDisplayEntries,
} from "./catalog-filters"
import { toCatalogBrowseClientProducts } from "./catalog-browse-client-product"

function product(
  partial: Record<string, unknown> & { id: string; title: string }
): Record<string, unknown> {
  return {
    handle: partial.handle ?? partial.id,
    thumbnail: null,
    images: [],
    variants: [{ id: "v1", prices: [{ amount: 10000 }] }],
    product_classification: { product_type: "STANDARD" },
    metadata: {},
    ...partial,
  }
}

/** Simulate backend merchandising order: furniture then accessory. */
const merchandised = [
  product({
    id: "bed",
    title: "Кровать",
    metadata: {
      collection: "greenwich",
      category_handle: "krovati",
      display_group: "gr-bed",
      display_group_sort: 1,
    },
  }),
  product({
    id: "bed-140",
    title: "Кровать 140",
    metadata: {
      collection: "greenwich",
      category_handle: "krovati",
      display_group: "gr-bed",
      display_group_sort: 2,
    },
  }),
  product({
    id: "wardrobe",
    title: "Гардероб",
    metadata: { collection: "greenwich", category_handle: "shkafy" },
  }),
  product({
    id: "mirror",
    title: "Зеркало навесное",
    handle: "greenwich-gr-09-1-mirror",
    metadata: { collection: "greenwich", category_handle: "zerkala" },
  }),
  product({
    id: "clock",
    title: "Часы",
    metadata: { collection: "oliver", category_handle: "chasy" },
  }),
]

{
  const normalized = toCatalogBrowseClientProducts(merchandised)
  assert.deepEqual(
    normalized.map((p) => p.id),
    merchandised.map((p) => p.id),
    "normalize preserves order"
  )

  const filtered = applyCatalogFilters(normalized as Record<string, unknown>[], {
    category: [],
    collection: [],
  })
  assert.deepEqual(
    filtered.map((p) => p.id),
    merchandised.map((p) => p.id),
    "empty filters preserve order"
  )

  const grouped = groupProductsForDisplay(filtered)
  assert.equal(grouped.length, 4, "bed sizes collapse to one card")
  assert.equal((grouped[0]!.product as { id: string }).id, "bed")
  assert.equal((grouped[1]!.product as { id: string }).id, "wardrobe")
  assert.equal((grouped[2]!.product as { id: string }).id, "mirror")
  assert.equal((grouped[3]!.product as { id: string }).id, "clock")

  const defaultSorted = sortDisplayEntries(grouped, undefined)
  assert.deepEqual(
    defaultSorted.map((e) => (e.product as { id: string }).id),
    ["bed", "wardrobe", "mirror", "clock"],
    "default sort is identity"
  )
  assert.notEqual(
    (defaultSorted[0]!.product as { title: string }).title.toLowerCase().includes(
      "зеркал"
    ),
    true
  )
  assert.equal((defaultSorted[0]!.product as { id: string }).id, "bed")
}

// groupProductsForDisplay: first-seen position, not Map iteration order
{
  const products = [
    product({
      id: "m1",
      title: "Зеркало",
      metadata: { display_group: "g1", display_group_sort: 1 },
    }),
    product({
      id: "b1",
      title: "Кровать",
      metadata: { display_group: "g2", display_group_sort: 1 },
    }),
    product({
      id: "m2",
      title: "Зеркало 2",
      metadata: { display_group: "g1", display_group_sort: 2 },
    }),
  ]
  const grouped = groupProductsForDisplay(products)
  assert.deepEqual(
    grouped.map((e) => (e.product as { id: string }).id),
    ["m1", "b1"],
    "group appears at first member index; later siblings dropped"
  )
}

// Explicit price sort still reorders
{
  const expensiveBed = product({
    id: "bed",
    title: "Кровать",
    variants: [{ id: "v", prices: [{ amount: 500000 }] }],
    metadata: { collection: "greenwich", category_handle: "krovati" },
  })
  const cheapMirror = product({
    id: "mirror",
    title: "Зеркало",
    variants: [{ id: "v", prices: [{ amount: 1000 }] }],
    metadata: { collection: "greenwich", category_handle: "zerkala" },
  })
  const grouped = groupProductsForDisplay([expensiveBed, cheapMirror])
  const asc = sortDisplayEntries(grouped, "price_asc")
  assert.equal((asc[0]!.product as { id: string }).id, "mirror")
  const desc = sortDisplayEntries(grouped, "price_desc")
  assert.equal((desc[0]!.product as { id: string }).id, "bed")
  const back = sortDisplayEntries(grouped, undefined)
  assert.equal((back[0]!.product as { id: string }).id, "bed")
}

console.log("catalog-merchandising-pipeline.fidelity.test.ts: ok")
