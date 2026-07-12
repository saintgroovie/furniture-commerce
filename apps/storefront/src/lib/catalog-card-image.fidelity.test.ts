/**
 * Contract: catalog card derivative path helper (H4).
 *
 *   ../backend/node_modules/.bin/tsx src/lib/catalog-card-image.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  resolveCatalogCardImageSrc,
  toCatalogCardDerivativePath,
} from "./catalog-card-image"

assert.equal(
  toCatalogCardDerivativePath("/static/products/oliver/ol-01-1.png"),
  "/static/products/oliver/derivatives/card/ol-01-1.webp"
)
assert.equal(
  toCatalogCardDerivativePath(
    "/product-static/products/greenwich/GR-09-1_main_01.png"
  ),
  "/product-static/products/greenwich/derivatives/card/GR-09-1_main_01.webp"
)
assert.equal(toCatalogCardDerivativePath("/uploads/x.png"), null)
assert.equal(
  resolveCatalogCardImageSrc("/static/products/oliver/ol-01-1.png"),
  "/static/products/oliver/derivatives/card/ol-01-1.webp"
)
assert.equal(
  resolveCatalogCardImageSrc(
    "/product-static/products/greenwich/GR-09-1_main_01.png"
  ),
  "/product-static/products/greenwich/derivatives/card/GR-09-1_main_01.webp"
)
assert.equal(
  resolveCatalogCardImageSrc("/static/products/oliver/ol-01-1.png", {
    preferDerivative: false,
  }),
  "/static/products/oliver/ol-01-1.png"
)
assert.equal(
  resolveCatalogCardImageSrc(
    "http://localhost:9000/static/products/oliver/ol-01-1.jpg"
  ),
  "/static/products/oliver/derivatives/card/ol-01-1.webp"
)

console.log("catalog-card-image.fidelity.test.ts: ok")
