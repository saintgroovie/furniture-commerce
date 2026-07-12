/**
 * Contract: G2 catalog browse allowlist projection.
 *
 *   node_modules/.bin/tsx src/api/store/products/catalog-browse-projection.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  CATALOG_METADATA_ALLOW,
  projectCatalogBrowseProduct,
  projectCatalogMetadataAllowlist,
} from "./catalog-browse-projection"

assert.ok(CATALOG_METADATA_ALLOW.has("collection"))
assert.ok(CATALOG_METADATA_ALLOW.has("finish_metadata_source"))
assert.ok(CATALOG_METADATA_ALLOW.has("bed_execution_matrix"))
assert.equal(CATALOG_METADATA_ALLOW.has("shared_scene_media"), false)
assert.equal(CATALOG_METADATA_ALLOW.has("workbook_row_key"), false)

{
  const meta = {
    collection: "provence",
    finish_metadata_source: "provence_paint_wood_split",
    shared_scene_media: { x: 1 },
    workbook_row_key: "row",
    readiness_status: "ready",
    frame_material_executions: [{ key: "oak", label: "Дуб", swatch_hex: "#c4a" }],
  }
  const projected = projectCatalogMetadataAllowlist(meta)!
  assert.equal(projected.collection, "provence")
  assert.equal(projected.finish_metadata_source, "provence_paint_wood_split")
  assert.deepEqual(projected.frame_material_executions, meta.frame_material_executions)
  assert.equal(projected.shared_scene_media, undefined)
  assert.equal(projected.workbook_row_key, undefined)
  assert.equal(projected.readiness_status, undefined)
}

{
  const product = {
    id: "prod_1",
    handle: "bed",
    title: "Bed",
    status: "published",
    thumbnail: "/static/products/a.jpg",
    metadata: {
      collection: "oliver",
      shared_scene_media: { a: 1 },
      display_group: "bed",
    },
    images: [
      { id: "img_1", url: "/static/products/a.jpg", rank: 0 },
      { id: "img_2", url: "  ", rank: 1 },
    ],
    variants: [
      {
        id: "var_1",
        sku: "OL-1",
        price_set: { prices: [{ amount: 100 }] },
        prices: [{ amount: 100, currency_code: "rub" }],
      },
    ],
    product_classification: { product_type: "STANDARD", extra: "drop" },
    description: "should drop",
  }
  const out = projectCatalogBrowseProduct(product)
  assert.equal(out.id, "prod_1")
  assert.equal(out.description, undefined)
  assert.deepEqual(out.images, [{ url: "/static/products/a.jpg" }])
  assert.deepEqual(out.variants, [
    { id: "var_1", sku: "OL-1", prices: [{ amount: 100 }] },
  ])
  assert.deepEqual(out.product_classification, { product_type: "STANDARD" })
  assert.equal((out.metadata as Record<string, unknown>).display_group, "bed")
  assert.equal(
    (out.metadata as Record<string, unknown>).shared_scene_media,
    undefined
  )
  assert.ok((product.metadata as Record<string, unknown>).shared_scene_media)
}

console.log("catalog-browse-projection.fidelity.test.ts: ok")
