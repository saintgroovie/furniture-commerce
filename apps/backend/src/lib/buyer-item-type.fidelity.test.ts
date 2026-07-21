/**
 * Fidelity tests for buyer-item-type normalizer + facet counting.
 *
 *   yarn --cwd apps/backend exec tsx src/lib/buyer-item-type.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  buildMissingBuyerItemTypeInventory,
  countBuyerItemTypeFacets,
  dedupeCatalogProductsById,
  projectBuyerItemTypeOntoProduct,
  resolveBuyerItemType,
} from "./buyer-item-type"
import { sortProductsByMerchandisingOrder } from "./catalog-merchandising-order"

function product(
  partial: Record<string, unknown> & { id: string; title: string }
): Record<string, unknown> {
  return {
    handle: partial.handle ?? partial.id,
    status: "published",
    metadata: {},
    product_classification: { product_type: "STANDARD" },
    ...partial,
  }
}

function assertFacetsAlign(products: Record<string, unknown>[]) {
  const projected = products.map((p) => projectBuyerItemTypeOntoProduct(p))
  const visible = projected.filter((p) => p.status === "published")
  const counts = countBuyerItemTypeFacets(visible)
  let facetSum = 0
  for (const n of counts.values()) facetSum += n
  const withType = visible.filter((p) => {
    const m = (p.metadata as Record<string, unknown>) ?? {}
    return typeof m.category_handle === "string" && m.category_handle
  }).length
  assert.equal(facetSum, withType)
}

// 1. total / facet math on filtered set
{
  const pool = [
    product({
      id: "1",
      title: "Кровать",
      metadata: { collection: "greenwich", category_handle: "krovati" },
    }),
    product({
      id: "2",
      title: "Зеркало",
      metadata: { collection: "greenwich", category_handle: "zerkala" },
    }),
    product({
      id: "3",
      title: "Комод Ballet",
      metadata: { collection: "willie-winkie" },
      product_classification: { product_type: "CONFIGURABLE" },
    }),
  ]
  const projected = pool.map((p) => projectBuyerItemTypeOntoProduct(p))
  assert.equal(
    (projected[2]!.metadata as Record<string, unknown>).category_handle,
    "komody"
  )
  assert.equal(
    (projected[2]!.metadata as Record<string, unknown>).buyer_item_type_source,
    "title_fallback"
  )
  assertFacetsAlign(projected)
}

// 2–3. hidden/unpublished excluded by caller; dedupe
{
  const duped = [
    product({ id: "a", title: "Кровать", metadata: { category_handle: "krovati" } }),
    product({ id: "a", title: "Кровать dup", metadata: { category_handle: "krovati" } }),
    product({ id: "b", title: "Стол", metadata: { category_handle: "stoly" } }),
  ]
  const deduped = dedupeCatalogProductsById(duped)
  assert.equal(deduped.length, 2)
}

// 4–5. STANDARD + CONFIGURABLE enter type facets
{
  const pool = [
    product({
      id: "s1",
      title: "Зеркало навесное",
      product_classification: { product_type: "STANDARD" },
      metadata: { collection: "greenwich" },
    }),
    product({
      id: "c1",
      title: "Кровать 160",
      product_classification: { product_type: "CONFIGURABLE" },
      metadata: { collection: "oliver", category_handle: "krovati" },
    }),
  ].map((p) => projectBuyerItemTypeOntoProduct(p))
  const facets = countBuyerItemTypeFacets(pool)
  assert.ok((facets.get("zerkala") ?? 0) >= 1)
  assert.ok((facets.get("krovati") ?? 0) >= 1)
}

// 6. Willie Winkie in kids type facets via title fallback
{
  const ww = projectBuyerItemTypeOntoProduct(
    product({
      id: "ww1",
      title: "Комод высокий Ballet",
      metadata: { collection: "willie-winkie" },
    })
  )
  assert.equal(
    (ww.metadata as Record<string, unknown>).category_handle,
    "komody"
  )
  const facets = countBuyerItemTypeFacets([ww])
  assert.equal(facets.get("komody"), 1)
}

// 7–9. collection + type filters (logical pools)
{
  const pool = [
    product({
      id: "1",
      title: "Кровать",
      metadata: { collection: "greenwich", category_handle: "krovati" },
    }),
    product({
      id: "2",
      title: "Комод",
      metadata: { collection: "oliver", category_handle: "komody" },
    }),
    product({
      id: "3",
      title: "Зеркало",
      metadata: { collection: "greenwich", category_handle: "zerkala" },
    }),
  ].map((p) => projectBuyerItemTypeOntoProduct(p))
  const greenwich = pool.filter(
    (p) => (p.metadata as Record<string, unknown>).collection === "greenwich"
  )
  const facets = countBuyerItemTypeFacets(greenwich)
  assert.equal(facets.get("krovati"), 1)
  assert.equal(facets.get("zerkala"), 1)
  assert.equal(facets.get("komody"), undefined)
}

// 10. search + facets: relative merchandising order preserved after filter
{
  const unordered = [
    product({
      id: "mirror",
      title: "Зеркало навесное",
      metadata: { collection: "greenwich", category_handle: "zerkala" },
    }),
    product({
      id: "bed",
      title: "Кровать",
      metadata: { collection: "greenwich", category_handle: "krovati" },
    }),
    product({
      id: "bumper",
      title: "Бортик",
      metadata: { collection: "willie-winkie", category_handle: "bortiki" },
    }),
    product({
      id: "crib",
      title: "Кроватка",
      metadata: { collection: "willie-winkie", category_handle: "krovati" },
    }),
  ]
  const sorted = sortProductsByMerchandisingOrder(
    unordered.map((p) => projectBuyerItemTypeOntoProduct(p))
  )
  assert.equal(sorted[0]!.id, "bed")
  const kids = sorted.filter(
    (p) =>
      (p.metadata as Record<string, unknown>).collection === "willie-winkie"
  )
  assert.equal(kids[0]!.id, "crib")
}

// 11. no duplicates after project
{
  const once = dedupeCatalogProductsById([
    product({ id: "x", title: "A" }),
    product({ id: "x", title: "A2" }),
  ])
  assert.equal(once.length, 1)
}

// 12. empty result
{
  assert.equal(countBuyerItemTypeFacets([]).size, 0)
}

// inventory lists unresolved structured types
{
  const row = buildMissingBuyerItemTypeInventory([
    product({ id: "u", title: "Mystery widget", metadata: { collection: "oliver" } }),
  ])
  assert.equal(row.length, 1)
  assert.equal(row[0]!.source, "unknown")
}

// product_categories source
{
  const resolved = resolveBuyerItemType(
    product({
      id: "pc",
      title: "X",
      product_categories: [{ handle: "stoly-i-stoliki" }],
    })
  )
  assert.equal(resolved.key, "stoly")
  assert.equal(resolved.source, "product_category")
}

// category_override must overwrite misclassified category_handle for facets
{
  const projected = projectBuyerItemTypeOntoProduct(
    product({
      id: "mis-tagged",
      title: "Шкаф с зеркалом",
      metadata: { collection: "oliver", category_handle: "zerkala" },
    })
  )
  const meta = projected.metadata as Record<string, unknown>
  assert.equal(meta.buyer_item_type_source, "category_override")
  assert.equal(meta.buyer_item_type, "shkafy")
  assert.equal(meta.category_handle, "shkafy")
  assert.equal(countBuyerItemTypeFacets([projected]).get("shkafy"), 1)
  assert.equal(countBuyerItemTypeFacets([projected]).get("zerkala"), undefined)
}

// Motif metadata must not replace buyer product type (Willie Winkie)
{
  const dresser = projectBuyerItemTypeOntoProduct(
    product({
      id: "ww-komod",
      title: "Комод высокий",
      metadata: {
        collection: "willie-winkie",
        motif_key: "ballet",
        motif_slug: "ballet",
        motif_title: "Ballet",
      },
    })
  )
  const table = projectBuyerItemTypeOntoProduct(
    product({
      id: "ww-stol",
      title: "Стол письменный",
      metadata: {
        collection: "willie-winkie",
        motif_key: "ants-village",
        motif_slug: "ants-village",
        motif_title: "Ant's Village",
      },
    })
  )
  assert.equal((dresser.metadata as Record<string, unknown>).category_handle, "komody")
  assert.equal((table.metadata as Record<string, unknown>).category_handle, "stoly")
  assert.equal((dresser.metadata as Record<string, unknown>).motif_slug, "ballet")
  assert.equal((table.metadata as Record<string, unknown>).motif_slug, "ants-village")

  const byMotif = [dresser, table].filter(
    (p) => (p.metadata as Record<string, unknown>).motif_slug === "ballet"
  )
  const typeFacets = countBuyerItemTypeFacets(byMotif)
  assert.equal(typeFacets.get("komody"), 1)
  assert.equal(typeFacets.get("stoly"), undefined)

  const byType = [dresser, table].filter(
    (p) => (p.metadata as Record<string, unknown>).category_handle === "stoly"
  )
  assert.equal(byType.length, 1)
  assert.equal((byType[0]!.metadata as Record<string, unknown>).motif_slug, "ants-village")
}

// Item without motif stays in product-type facets
{
  const bare = projectBuyerItemTypeOntoProduct(
    product({
      id: "ww-bare",
      title: "Тумба прикроватная",
      metadata: { collection: "willie-winkie" },
    })
  )
  assert.equal((bare.metadata as Record<string, unknown>).category_handle, "tumby")
  assert.equal(countBuyerItemTypeFacets([bare]).get("tumby"), 1)
  assert.equal((bare.metadata as Record<string, unknown>).motif_slug, undefined)
}

// Invalid / unknown type stays out of misleading facets
{
  const unknown = projectBuyerItemTypeOntoProduct(
    product({
      id: "x",
      title: "Mystery SKU",
      metadata: { collection: "willie-winkie", motif_slug: "ballet" },
    })
  )
  assert.equal((unknown.metadata as Record<string, unknown>).buyer_item_type, null)
  assert.equal(countBuyerItemTypeFacets([unknown]).size, 0)
  assert.equal((unknown.metadata as Record<string, unknown>).motif_slug, "ballet")
}

console.log("buyer-item-type.fidelity.test.ts: ok")
