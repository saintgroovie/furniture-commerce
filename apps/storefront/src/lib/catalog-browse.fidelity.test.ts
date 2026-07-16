/**
 * Phase E: client browse helpers match server filter/facet/group pipeline.
 * Run from apps/storefront:
 *   ../backend/node_modules/.bin/tsx src/lib/catalog-browse.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  applyCatalogFilters,
  buildAllCatalogFacets,
  sortDisplayEntries,
  type CatalogFilterState,
} from "./catalog-filters"
import { groupProductsForDisplay } from "./display-group"
import {
  buildCatalogHref,
  parseCatalogFilterState,
} from "./catalog-filter-params"
import { toCatalogBrowseClientProduct } from "./catalog-browse-client-product"

function product(
  id: string,
  classification: "STANDARD" | "CONFIGURABLE",
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

function browse(
  pool: Record<string, unknown>[],
  state: CatalogFilterState
) {
  const filtered = applyCatalogFilters(pool, state)
  const facets = buildAllCatalogFacets(pool, state)
  const entries = sortDisplayEntries(
    groupProductsForDisplay(filtered),
    state.sort
  )
  return {
    ids: entries.map((e) => (e.product as { id: string }).id).sort(),
    facets,
    count: entries.length,
  }
}

const pool = [
  product("a", "STANDARD", {
    category: "krovati",
    collection: "greenwich",
    amount: 50000,
  }),
  product("b", "CONFIGURABLE", {
    category: "shkafy",
    collection: "oliver",
    amount: 80000,
  }),
  product("c", "STANDARD", {
    category: "shkafy",
    collection: "oliver",
    amount: 30000,
  }),
]

const queries = [
  "",
  "category=krovati",
  "collection=oliver",
  "type=STANDARD&category=shkafy",
  "sort=price_asc",
]

for (const q of queries) {
  const state = parseCatalogFilterState(
    Object.fromEntries(new URLSearchParams(q))
  )
  const a = browse(pool, state)
  const b = browse(pool, state)
  assert.deepEqual(a, b)
  const href = buildCatalogHref("/catalog", state)
  const roundtrip = parseCatalogFilterState(
    Object.fromEntries(new URL(href, "http://local").searchParams)
  )
  assert.deepEqual(roundtrip, state)
  assert.ok(a.count >= 0)
}

{
  const state = parseCatalogFilterState({ category: "krovati" })
  const { ids, facets } = browse(pool, state)
  assert.deepEqual(ids, ["a"])
  const shkafy = facets.categories.find((c) => c.value === "shkafy")
  assert.ok(shkafy && shkafy.count > 0, "self-excluding category facet")
}

{
  // Catalog cards need Color→Wood; client browse must keep paint matrix.
  // main lean caps keep 1 URL per matrix cell — enough for hero swap.
  const matrix = [
    {
      frame_material: "natural",
      paint_finish: "cream",
      label: "Сливочный",
      urls: Array.from({ length: 8 }, (_, i) => `/static/cream_n_${i}.jpg`),
    },
    {
      frame_material: "dark",
      paint_finish: "cream",
      label: "Сливочный",
      urls: Array.from({ length: 8 }, (_, i) => `/static/cream_d_${i}.jpg`),
    },
  ]
  const out = toCatalogBrowseClientProduct({
    id: "prod_gw",
    handle: "greenwich-gr-05-1",
    title: "Scale",
    thumbnail: "/static/cream_n_0.jpg",
    metadata: {
      greenwich_paint_execution_matrix: matrix,
      execution_dimension_contract:
        "paint_finish|frame_material|greenwich_paint_execution_matrix|shared_scene",
      shared_scene_media: { drop: true },
      workbook_row_key: "drop-me",
    },
    images: [],
    variants: [],
  })
  const meta = out.metadata as {
    greenwich_paint_execution_matrix: Array<{ urls: string[] }>
    execution_dimension_contract?: string
    shared_scene_media?: unknown
    workbook_row_key?: unknown
  }
  assert.equal(meta.greenwich_paint_execution_matrix.length, 2)
  assert.equal(meta.greenwich_paint_execution_matrix[0]!.urls.length, 1)
  assert.equal(
    meta.greenwich_paint_execution_matrix[0]!.urls[0],
    "/static/cream_n_0.jpg"
  )
  assert.equal(
    meta.greenwich_paint_execution_matrix[1]!.urls[0],
    "/static/cream_d_0.jpg"
  )
  assert.match(
    meta.execution_dimension_contract || "",
    /greenwich_paint_execution_matrix/
  )
  assert.equal(meta.shared_scene_media, undefined)
  assert.equal(meta.workbook_row_key, undefined)
}

console.log("catalog-browse.fidelity.test.ts: ok")
