/**
 * Catalog facet self-excluding fidelity (phase C).
 * Run from apps/storefront:
 *   ../backend/node_modules/.bin/tsx src/lib/catalog-facets.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  buildAllCatalogFacets,
  buildCatalogFacets,
  type CatalogFilterState,
  type CatalogFacets,
} from "./catalog-filters"
import { groupProductsForDisplay } from "./display-group"

function product(
  id: string,
  classification: "STANDARD" | "CONFIGURABLE" | "BESPOKE",
  extras: {
    category?: string
    collection?: string
    amount?: number
    title?: string
  } = {}
): Record<string, unknown> {
  return {
    id,
    title: extras.title ?? id,
    handle: id,
    product_classification: { product_type: classification },
    metadata: {
      collection: extras.collection ?? "greenwich",
      category_handle: extras.category ?? "krovati",
    },
    variants: [
      {
        prices: [{ amount: extras.amount ?? 10000, currency_code: "rub" }],
      },
    ],
  }
}

function baseState(
  overrides: Partial<CatalogFilterState> = {}
): CatalogFilterState {
  return {
    category: [],
    collection: [],
    ...overrides,
  }
}

/** Legacy page composition: 4 independent exclude-group calls. */
function legacyPageFacets(
  products: Record<string, unknown>[],
  state: CatalogFilterState
): CatalogFacets {
  const categoryFacets = buildCatalogFacets(products, state, "category")
  const collectionFacets = buildCatalogFacets(products, state, "collection")
  return {
    types: buildCatalogFacets(products, state, "type").types,
    categories: categoryFacets.categories,
    collections: collectionFacets.collections,
    categoryAllCount: categoryFacets.categoryAllCount,
    collectionAllCount: collectionFacets.collectionAllCount,
    priceRange: buildCatalogFacets(products, state, "price").priceRange,
  }
}

const pool = [
  product("std-bed", "STANDARD", {
    category: "krovati",
    collection: "greenwich",
    amount: 50000,
  }),
  product("cfg-bed", "CONFIGURABLE", {
    category: "krovati",
    collection: "oliver",
    amount: 80000,
  }),
  product("std-cab", "STANDARD", {
    category: "shkafy",
    collection: "oliver",
    amount: 120000,
  }),
  product("cfg-cab", "CONFIGURABLE", {
    category: "shkafy",
    collection: "greenwich",
    amount: 90000,
  }),
  product("std-table", "STANDARD", {
    category: "stoly",
    collection: "monchelsea",
    amount: 30000,
    title: "стол письменный",
  }),
  product("bsp-1", "BESPOKE", {
    category: "krovati",
    collection: "greenwich",
    amount: 200000,
  }),
]

const states: CatalogFilterState[] = [
  baseState(),
  baseState({ category: ["krovati"] }),
  baseState({ collection: ["oliver"] }),
  baseState({ type: "STANDARD", category: ["shkafy"] }),
  baseState({
    collection: ["greenwich"],
    priceMin: 40000,
    priceMax: 100000,
  }),
  baseState({ q: "стол", category: ["stoly"] }),
]

for (const state of states) {
  const legacy = legacyPageFacets(pool, state)
  const next = buildAllCatalogFacets(pool, state)
  assert.deepEqual(
    next,
    legacy,
    `buildAllCatalogFacets must match legacy 4-call facets for ${JSON.stringify(state)}`
  )
}

// Self-excluding: with category=krovati, shkafy count on category facet
// still reflects products matching other filters (type/collection/price/q),
// not zeroed by the selected category.
{
  const state = baseState({ category: ["krovati"] })
  const facets = buildAllCatalogFacets(pool, state)
  const shkafy = facets.categories.find((c) => c.value === "shkafy")
  assert.ok(shkafy, "shkafy option remains visible")
  assert.ok(
    (shkafy?.count ?? 0) > 0,
    "self-excluding: other categories keep counts"
  )
  const krovati = facets.categories.find((c) => c.value === "krovati")
  assert.equal(krovati?.count, 3) // std-bed, cfg-bed, bsp-1 in pool without category filter
}

// Count contract: «Все» / allCount uses display cards (display_group collapse),
// same unit as «Найдено», never sum(raw SKU option counts).
{
  const groupedPool = [
    product("g1-a", "STANDARD", {
      category: "krovati",
      collection: "oliver",
      amount: 10000,
    }),
    product("g1-b", "STANDARD", {
      category: "krovati",
      collection: "oliver",
      amount: 11000,
    }),
    product("solo", "STANDARD", {
      category: "shkafy",
      collection: "greenwich",
      amount: 20000,
    }),
  ]
  ;(groupedPool[0]!.metadata as Record<string, unknown>).display_group = "bed-g1"
  ;(groupedPool[1]!.metadata as Record<string, unknown>).display_group = "bed-g1"

  const state = baseState()
  const facets = buildAllCatalogFacets(groupedPool, state)
  const heading = groupProductsForDisplay(groupedPool).length
  assert.equal(heading, 2)
  assert.equal(facets.collectionAllCount, heading)
  assert.equal(facets.categoryAllCount, heading)
  const rawSkuSum = 3
  assert.notEqual(
    facets.collectionAllCount,
    rawSkuSum,
    "Все must not equal raw SKU sum when display_group collapses"
  )
  const oliver = facets.collections.find((c) => c.value === "oliver")
  assert.equal(oliver?.count, 1, "option count is one card, not two SKUs")
}

console.log("catalog-facets.fidelity.test.ts: ok")
