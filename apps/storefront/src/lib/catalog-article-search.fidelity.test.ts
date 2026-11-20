/** Only the newly changed article search seam; no server or catalog capture. */
import assert from "node:assert/strict"
import { matchesCatalogArticle, normalizeCatalogArticle } from "./catalog-article-search"
import { applyCatalogFilters, buildAllCatalogFacets, type CatalogFilterState } from "./catalog-filters"
import { toCatalogBrowseClientProducts } from "./catalog-browse-client-product"
import { catalogUiCopy } from "./woodright-copy"

// Contract fixtures, not a current catalog/price/stock claim.
const product = (id: string, skus: string[], extra: Record<string, unknown> = {}) => ({
  id, status: "published", title: "Кровать Оливер", handle: "unrelated-" + id,
  metadata: { collection: "oliver", category_handle: "krovati" },
  variants: skus.map((sku, i) => ({ id: id + "-variant-" + i, sku })), ...extra,
})
const first = product("exact", ["OL-14-2"])
const secondVariant = product("multi", ["OL-65-1", "OL-65-2"])
const leading = product("leading", ["OL-001-02-A"])
const longer = product("longer", ["OL-14-20"])
const decoy = product("decoy", ["OTHER-1"], {
  title: "OL-14-2", handle: "ol-14-2",
  description: "OL-14-2", metadata: { canonical_name: "OL-14-2", sku: "OL-14-2", article: "OL-14-2", aliases: ["OL-14-2"], collection_label: "OL-14-2" },
})
const pool = [first, secondVariant, leading, longer, decoy]
const state = (q: string): CatalogFilterState => ({ q, category: [], collection: [] })
const ids = (rows: Record<string, unknown>[]) => rows.map(p => p.id)
assert.deepEqual(ids(applyCatalogFilters(pool, state("OL-14-2"))), ["exact"])
assert.deepEqual(ids(applyCatalogFilters(pool, state("  ol–14−2  "))), ["exact"])
assert.deepEqual(ids(applyCatalogFilters(pool, state("OL-65-2"))), ["multi"])
assert.deepEqual(ids(applyCatalogFilters(pool, state("OL-001-02-a"))), ["leading"])
for (const q of ["OL-14", "OL-14-", "OL-14-200", "OL-1-02-A", "OL-001-02", "OL-001-02-B", "Кровать", "Оливер", "oliver", "кровати", "OL -14-2", "OL- 14-2", "OL—14―2", "OL﹣14﹣2", "ОL-14-2"]) {
  assert.deepEqual(ids(applyCatalogFilters(pool, state(q))), [], q)
}
assert.equal(normalizeCatalogArticle("OL-001-02-A"), "OL-001-02-A")
assert.equal(normalizeCatalogArticle(" a  001-b "), "A  001-B")
assert.equal(matchesCatalogArticle(product("spaces", ["A  001-B"]), "A 001-B"), false)
assert.equal(matchesCatalogArticle(product("zeros", ["OL-08-1"]), "OL-8-1"), false)
assert.equal(matchesCatalogArticle(product("ww", ["WW-01-MOTIF-A"]), "WW-01"), false)
assert.deepEqual(ids(applyCatalogFilters(pool, state("  "))), ids(pool))
assert.equal(matchesCatalogArticle({ variants: [null, 3, { sku: 123 }] }, "123"), false)
assert.equal(matchesCatalogArticle({ handle: "ol-14-2" }, "OL-14-2"), false)
// The same matching results must survive the existing SSR→client slim transport.
const slim = toCatalogBrowseClientProducts(pool)
assert.deepEqual(ids(applyCatalogFilters(slim, state("OL-65-2"))), ["multi"])
const facets = buildAllCatalogFacets(pool, state("OL-14-2"))
assert.equal(facets.categoryAllCount, 1)
assert.equal(facets.collectionAllCount, 1)
// Exact search keeps source objects and native variants intact: no reordering,
// price/default/stock mutation or canonical redirect selection by the search.
assert.equal(applyCatalogFilters(pool, state("OL-65-2"))[0], secondVariant)
assert.deepEqual(secondVariant.variants.map(v => v.sku), ["OL-65-1", "OL-65-2"])
assert.equal(catalogUiCopy.searchLabel, "Поиск по артикулу")
assert.equal(catalogUiCopy.searchPlaceholder, "Введите артикул")
assert.equal(catalogUiCopy.searchPlaceholderCompact, "Артикул")
assert(catalogUiCopy.searchPlaceholderCompact.length < catalogUiCopy.searchPlaceholder.length)
console.log("catalog-article-search: changed seam PASS")
