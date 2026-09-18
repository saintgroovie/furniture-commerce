/**
 * W3e: compact browse client product caps.
 *
 *   ../backend/node_modules/.bin/tsx src/lib/catalog-browse-client-product.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { toCatalogBrowseClientProduct } from "./catalog-browse-client-product"

{
  const raw = {
    id: "p1",
    handle: "h1",
    title: "T",
    status: "published",
    thumbnail: "/t.jpg",
    description: "drop",
    images: [
      { url: "/a.jpg", id: "1" },
      { url: "/b.jpg", id: "2" },
    ],
    variants: [
      {
        id: "v1",
        sku: "SKU",
        prices: [{ amount: 10, currency_code: "rub" }],
      },
    ],
    product_classification: { product_type: "STANDARD", extra: 1 },
    metadata: {
      collection: "greenwich",
      workbook_row_key: "x",
      launch_mode: "request_quote",
      display_group_sort: 2,
      finish_color_executions: [
        { key: "w", label: "White", urls: ["/1.jpg", "/2.jpg"] },
      ],
    },
  }
  const out = toCatalogBrowseClientProduct(raw)
  assert.equal(out.status, undefined)
  assert.equal(out.description, undefined)
  assert.deepEqual(out.images, [{ url: "/a.jpg" }, { url: "/b.jpg" }])
  assert.deepEqual(out.product_classification, { product_type: "STANDARD" })
  const meta = out.metadata as Record<string, unknown>
  assert.equal(meta.collection, "greenwich")
  assert.equal(meta.workbook_row_key, undefined)
  assert.equal(meta.launch_mode, "request_quote")
  assert.equal(meta.display_group_sort, 2)
  assert.deepEqual(meta.finish_color_executions, [
    { key: "w", label: "White", urls: ["/1.jpg", "/2.jpg"] },
  ])
}

{
  const out = toCatalogBrowseClientProduct({
    id: "p2",
    handle: "ww-1",
    title: "Комод",
    metadata: {
      collection: "willie-winkie",
      category_handle: "komody",
      buyer_item_type: "komody",
      buyer_item_type_source: "title_fallback",
      workbook_row_key: "secret",
    },
  })
  const meta = out.metadata as Record<string, unknown>
  assert.equal(meta.category_handle, "komody")
  assert.equal(meta.buyer_item_type, "komody")
  assert.equal(meta.buyer_item_type_source, "title_fallback")
  assert.equal(meta.workbook_row_key, undefined)
}

{
  // Mirror of backend browse pass-through (hygiene leftover C4).
  const cfg = {
    min_unit_price: 54355,
    original_min_unit_price: 62000,
    material_execution_code: "solid_front_ldsp_body",
    material_execution_label: "Фасады из массива, корпус ЛДСП",
    material_price_multiplier: 0.7,
    variant_id: "var_1",
    color_multiplier: 1,
  }
  const tiers = {
    solid_front_ldsp_body: {
      key: "solid_front_ldsp_body",
      label_ru: "Фасады из массива, корпус ЛДСП",
      description_ru: "Текст для покупателя",
      price_multiplier: 0.7,
      position: 0,
    },
  }
  const out = toCatalogBrowseClientProduct({
    id: "p-lock",
    handle: "gr-bed",
    title: "Кровать",
    metadata: {
      collection: "greenwich",
      dimensions: { width_mm: 1030, depth_mm: 2207, height_mm: 1050 },
      dimensions_normalized: { width_mm: 1030, extra: true },
      buyer_default_configuration: cfg,
      material_tiers: tiers,
    },
  })
  const meta = out.metadata as Record<string, unknown>
  assert.deepEqual(meta.buyer_default_configuration, cfg)
  assert.deepEqual(meta.material_tiers, tiers)
  assert.deepEqual(meta.dimensions_normalized, { width_mm: 1030, extra: true })
}

console.log("catalog-browse-client-product.fidelity.test.ts: ok")
