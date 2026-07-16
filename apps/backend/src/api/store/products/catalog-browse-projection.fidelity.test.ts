/**
 * Contract: G2 catalog browse allowlist projection.
 *
 *   node_modules/.bin/tsx src/api/store/products/catalog-browse-projection.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  CATALOG_BROWSE_MAX_EXECUTION_URLS,
  CATALOG_BROWSE_MAX_IMAGES,
  CATALOG_BROWSE_MAX_IMAGES_PER_TOKEN,
  CATALOG_METADATA_ALLOW,
  projectCatalogBrowseProduct,
  projectCatalogMetadataAllowlist,
} from "./catalog-browse-projection"

assert.equal(CATALOG_BROWSE_MAX_IMAGES, 24)
assert.equal(CATALOG_BROWSE_MAX_IMAGES_PER_TOKEN, 3)
assert.equal(CATALOG_BROWSE_MAX_EXECUTION_URLS, 5)

assert.ok(CATALOG_METADATA_ALLOW.has("collection"))
assert.ok(CATALOG_METADATA_ALLOW.has("finish_metadata_source"))
assert.ok(CATALOG_METADATA_ALLOW.has("bed_execution_matrix"))
assert.ok(CATALOG_METADATA_ALLOW.has("greenwich_paint_execution_matrix"))
assert.ok(CATALOG_METADATA_ALLOW.has("execution_dimension_contract"))
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

{
  const many = Array.from({ length: 8 }, (_, i) => ({
    id: `img_${i}`,
    url: `/static/products/x${i}.jpg`,
    rank: i,
  }))
  const out = projectCatalogBrowseProduct({
    id: "prod_cap",
    handle: "cap",
    title: "Cap",
    thumbnail: "/static/products/x0.jpg",
    metadata: {
      finish_color_executions: [
        {
          key: "white",
          urls: Array.from({ length: 8 }, (_, i) => `/static/e${i}.jpg`),
        },
      ],
    },
    images: many,
    variants: [],
  })
  // Untokenized `_other` images share one per-token budget.
  assert.equal(
    (out.images as unknown[]).length,
    CATALOG_BROWSE_MAX_IMAGES_PER_TOKEN
  )
  const meta = out.metadata as {
    finish_color_executions: Array<{ urls: string[] }>
  }
  assert.equal(
    meta.finish_color_executions[0].urls.length,
    CATALOG_BROWSE_MAX_EXECUTION_URLS
  )
}

{
  // Diversify: do not starve later finishes when early colors fill the list.
  const images = [
    ...[1, 2, 3, 4].map((n) => ({
      url: `/static/products/greenwich/GR-05-1_greenwich_white0${n}.jpg`,
    })),
    ...[1, 2, 3].map((n) => ({
      url: `/static/products/greenwich/GR-05-1_greenwich_graphite0${n}.jpg`,
    })),
    ...[1, 2].map((n) => ({
      url: `/static/products/greenwich/GR-05-1_greenwich_green0${n}.jpg`,
    })),
  ]
  const out = projectCatalogBrowseProduct({
    id: "prod_div",
    handle: "greenwich-gr-05-1",
    title: "Dresser",
    thumbnail: images[0]!.url,
    metadata: {},
    images,
    variants: [],
  })
  const urls = (out.images as Array<{ url: string }>).map((i) => i.url)
  assert.equal(urls.filter((u) => /_white\d/.test(u)).length, 3)
  assert.equal(urls.filter((u) => /_graphite\d/.test(u)).length, 3)
  assert.equal(urls.filter((u) => /_green\d/.test(u)).length, 2)
}

{
  // Greenwich paint matrix must stay on catalog wire (Color→Wood card UX).
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
  const out = projectCatalogBrowseProduct({
    id: "prod_gw",
    handle: "greenwich-gr-05-1",
    title: "Scale",
    thumbnail: "/static/cream_n_0.jpg",
    metadata: {
      greenwich_paint_execution_matrix: matrix,
      execution_dimension_contract:
        "paint_finish|frame_material|greenwich_paint_execution_matrix|shared_scene",
      shared_scene_media: { drop: true },
    },
    images: [],
    variants: [],
  })
  const meta = out.metadata as {
    greenwich_paint_execution_matrix: Array<{ urls: string[] }>
    execution_dimension_contract?: string
    shared_scene_media?: unknown
  }
  assert.equal(meta.greenwich_paint_execution_matrix.length, 2)
  assert.equal(
    meta.greenwich_paint_execution_matrix[0]!.urls.length,
    CATALOG_BROWSE_MAX_EXECUTION_URLS
  )
  assert.equal(
    meta.greenwich_paint_execution_matrix[1]!.urls.length,
    CATALOG_BROWSE_MAX_EXECUTION_URLS
  )
  assert.match(meta.execution_dimension_contract || "", /greenwich_paint_execution_matrix/)
  assert.equal(meta.shared_scene_media, undefined)
}

console.log("catalog-browse-projection.fidelity.test.ts: ok")
