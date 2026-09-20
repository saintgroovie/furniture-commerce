/**
 * RSC ATF slice + main/kids pool scope (catalog HTML budget).
 *
 *   ../backend/node_modules/.bin/tsx src/lib/catalog-browse-pool.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { CATALOG_ATF_EAGER_COUNT } from "./catalog-atf"
import {
  catalogBrowseDisplayEntries,
  catalogItemListJsonLdPayload,
  collectAtfBrowseProducts,
  parseStoreCatalogProductsPayload,
  scopeCatalogBrowsePool,
} from "./catalog-browse-pool"

function product(
  id: string,
  extras: {
    collection?: string
    handle?: string
    title?: string
    displayGroup?: string
    type?: string
  } = {}
): Record<string, unknown> {
  return {
    id,
    title: extras.title ?? id,
    handle: extras.handle ?? id,
    product_classification: {
      product_type: extras.type ?? "STANDARD",
    },
    metadata: {
      collection: extras.collection ?? "greenwich",
      ...(extras.displayGroup
        ? { display_group: extras.displayGroup, display_group_sort: 1 }
        : {}),
    },
    variants: [{ prices: [{ amount: 10000, currency_code: "rub" }] }],
  }
}

{
  const kids = product("k1", { collection: "oliver-kids" })
  const seed = product("seed", { handle: "stul-loft", collection: "greenwich" })
  const bespoke = product("b1", { type: "BESPOKE" })
  const main = product("m1")
  const paused = product("p1", { collection: "provence" })
  const pool = [kids, seed, bespoke, main, paused]
  const scoped = scopeCatalogBrowsePool(pool, "main", ["k1"])
  assert.deepEqual(
    scoped.map((p) => p.id),
    ["m1"]
  )
}

{
  const kids = product("k1", { collection: "oliver-kids" })
  const main = product("m1")
  const scoped = scopeCatalogBrowsePool([kids, main], "kids", ["k1"])
  assert.deepEqual(
    scoped.map((p) => p.id),
    ["k1"]
  )
}

{
  const products = Array.from({ length: 20 }, (_, i) =>
    product(`p${i}`, { title: `Item ${i}` })
  )
  const atf = collectAtfBrowseProducts(products, { category: [], collection: [] })
  assert.equal(atf.length, CATALOG_ATF_EAGER_COUNT)
  assert.deepEqual(
    atf.map((p) => p.id),
    products.slice(0, CATALOG_ATF_EAGER_COUNT).map((p) => p.id)
  )
}

{
  const a = product("a", { displayGroup: "bed-a", title: "Bed A 160" })
  const a2 = product("a2", { displayGroup: "bed-a", title: "Bed A 180" })
  const b = product("b", { title: "Chair" })
  const atf = collectAtfBrowseProducts([a, a2, b], { category: [], collection: [] })
  assert.equal(atf.length, 2)
  assert.deepEqual(
    atf.map((p) => p.id).sort(),
    ["a", "b"]
  )
  assert.equal(atf.find((p) => p.id === "a")?.title, "Bed A 160")
}

{
  const products = [product("m1", { title: "Main" })]
  const entries = catalogBrowseDisplayEntries(products, {
    category: [],
    collection: [],
  })
  const jsonLd = catalogItemListJsonLdPayload("https://woodright-demo.ru", entries)
  assert.equal(jsonLd?.["@type"], "ItemList")
  assert.equal(jsonLd?.numberOfItems, 1)
  const items = jsonLd?.itemListElement as Array<Record<string, unknown>>
  assert.equal(items[0]?.url, "https://woodright-demo.ru/product/m1")
  assert.equal(items[0]?.name, "Main")
}

{
  const parsed = parseStoreCatalogProductsPayload({ products: [{ id: "p1" }] })
  assert.equal(parsed.length, 1)
  assert.throws(() => parseStoreCatalogProductsPayload({}))
  assert.throws(() => parseStoreCatalogProductsPayload(null))
  assert.throws(() => parseStoreCatalogProductsPayload({ products: null }))
}

console.log("catalog-browse-pool.fidelity.test.ts: ok")
