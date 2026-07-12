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
assert.ok(CATALOG_METADATA_ALLOW.has("launch_mode"))
assert.ok(CATALOG_METADATA_ALLOW.has("display_group_sort"))
assert.ok(CATALOG_METADATA_ALLOW.has("display_group_title"))
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
      display_group_sort: 1,
      display_group_title: "Кровати",
      launch_mode: "request_quote",
      bed_execution_matrix: [
        {
          headboard_model: "frame",
          frame_material: "oak",
          fabric_upholstery: "beige",
          urls: ["/a.jpg", "/b.jpg", "/c.jpg"],
        },
      ],
    },
    images: [
      { id: "img_1", url: "/static/products/a.jpg", rank: 0 },
      { id: "img_2", url: "/static/products/b.jpg", rank: 1 },
      { id: "img_3", url: "  ", rank: 2 },
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
  assert.equal(out.status, undefined)
  assert.equal(out.description, undefined)
  assert.deepEqual(out.images, [{ url: "/static/products/a.jpg" }])
  assert.deepEqual(out.variants, [
    { id: "var_1", sku: "OL-1", prices: [{ amount: 100 }] },
  ])
  assert.deepEqual(out.product_classification, { product_type: "STANDARD" })
  const meta = out.metadata as Record<string, unknown>
  assert.equal(meta.display_group, "bed")
  assert.equal(meta.display_group_sort, 1)
  assert.equal(meta.display_group_title, "Кровати")
  assert.equal(meta.launch_mode, "request_quote")
  assert.equal(meta.shared_scene_media, undefined)
  assert.deepEqual(meta.bed_execution_matrix, [
    {
      headboard_model: "frame",
      frame_material: "oak",
      fabric_upholstery: "beige",
      urls: ["/a.jpg"],
    },
  ])
  assert.ok((product.metadata as Record<string, unknown>).shared_scene_media)
}

console.log("catalog-browse-projection.fidelity.test.ts: ok")
