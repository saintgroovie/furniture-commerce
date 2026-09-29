/**
 * Draft products are not buyer-visible. Published products stay visible.
 *
 *   ../backend/node_modules/.bin/tsx src/lib/buyer-publication.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { isBuyerPublicProductStatus } from "./buyer-publication"
import { collectProductSitemapEntries } from "./sitemap-entries"
import { toCatalogBrowseClientProducts } from "./catalog-browse-client-product"

assert.equal(isBuyerPublicProductStatus("published"), true)
assert.equal(isBuyerPublicProductStatus("draft"), false)
assert.equal(isBuyerPublicProductStatus(undefined), false)
assert.equal(isBuyerPublicProductStatus(null), false)
assert.equal(isBuyerPublicProductStatus(""), false)

const listed = toCatalogBrowseClientProducts([
  { id: "pub", handle: "ol-03-1", title: "Published", status: "published" },
  { id: "draft", handle: "pr-02-1", title: "Draft", status: "draft" },
  { id: "missing", handle: "missing", title: "Missing" },
])
assert.deepEqual(
  listed.map((product) => product.id),
  ["pub"]
)

const sitemap = collectProductSitemapEntries("https://woodright.ru", [
  { handle: "ol-03-1", status: "published" },
  { handle: "pr-02-1", status: "draft" },
  { handle: "pr-06-1" },
])
assert.deepEqual(
  sitemap.map((entry) => entry.loc),
  ["https://woodright.ru/product/ol-03-1"]
)

const productsApi = readFileSync(join("src/lib/api/products.ts"), "utf8")
assert.match(productsApi, /publicProductOrThrow/)
assert.match(productsApi, /isBuyerPublicProductStatus/)
const pdp = readFileSync(join("src/app/product/[id]/page.tsx"), "utf8")
assert.match(pdp, /notFound\(\)/)
assert.match(pdp, /getProduct\(id\)/)
const layout = readFileSync(join("src/app/layout.tsx"), "utf8")
assert.match(layout, /rejectUnpublishedProduct/)
assert.match(layout, /notFound\(\)/)
const proxy = readFileSync(join("src/proxy.ts"), "utf8")
assert.match(proxy, /x-woodright-pathname/)

console.log("buyer-publication.fidelity.test.ts: ok")
