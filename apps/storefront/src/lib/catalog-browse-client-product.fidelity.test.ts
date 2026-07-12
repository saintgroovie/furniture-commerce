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
  assert.deepEqual(out.images, [{ url: "/a.jpg" }])
  assert.deepEqual(out.product_classification, { product_type: "STANDARD" })
  const meta = out.metadata as Record<string, unknown>
  assert.equal(meta.collection, "greenwich")
  assert.equal(meta.workbook_row_key, undefined)
  assert.equal(meta.launch_mode, "request_quote")
  assert.equal(meta.display_group_sort, 2)
  assert.deepEqual(meta.finish_color_executions, [
    { key: "w", label: "White", urls: ["/1.jpg"] },
  ])
}

console.log("catalog-browse-client-product.fidelity.test.ts: ok")
