/**
 * Contract: catalog listing metadata projection (`/store/catalog-products`).
 *
 *   node_modules/.bin/tsx src/api/store/products/catalog-view-projection.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  CATALOG_METADATA_DROP,
  CATALOG_VIEW,
  projectCatalogMetadata,
  projectCatalogProduct,
} from "./catalog-view-projection"

assert.equal(CATALOG_VIEW, "catalog")
assert.ok(CATALOG_METADATA_DROP.has("shared_scene_media"))
assert.ok(CATALOG_METADATA_DROP.has("workbook_row_key"))

const keptKeys = [
  "collection",
  "display_group",
  "swatch_hex",
  "finish",
  "frame_material_executions",
  "paint_material_executions",
]

{
  const meta = {
    shared_scene_media: { scenes: [] },
    workbook_row_key: "row-1",
    readiness_status: "ready",
    collection: "oliver",
    display_group: "bed",
    swatch_hex: "#aabbcc",
    finish: "oil",
    frame_material_executions: [{ key: "oak", label: "Дуб", swatch_hex: "#c4a" }],
    paint_material_executions: [],
  }
  const projected = projectCatalogMetadata(meta)
  assert.ok(projected)
  for (const k of CATALOG_METADATA_DROP) {
    assert.equal(projected![k], undefined, `drop ${k}`)
  }
  for (const k of keptKeys) {
    assert.deepEqual(projected![k], meta[k as keyof typeof meta], `keep ${k}`)
  }
}

assert.equal(projectCatalogMetadata(null), null)
assert.equal(projectCatalogMetadata(undefined), undefined)
assert.deepEqual(projectCatalogMetadata(["x"]), ["x"])

{
  const product = {
    id: "prod_1",
    handle: "bed-oak",
    metadata: {
      shared_scene_media: { a: 1 },
      finish: "oil",
    },
    title: "Bed",
  }
  const out = projectCatalogProduct(product)
  assert.equal(out.id, "prod_1")
  assert.equal(out.title, "Bed")
  assert.equal((out.metadata as Record<string, unknown>).finish, "oil")
  assert.equal(
    (out.metadata as Record<string, unknown>).shared_scene_media,
    undefined
  )
  // Input not mutated
  assert.ok(
    (product.metadata as Record<string, unknown>).shared_scene_media
  )
}

console.log("catalog-view-projection.fidelity.test.ts: ok")
