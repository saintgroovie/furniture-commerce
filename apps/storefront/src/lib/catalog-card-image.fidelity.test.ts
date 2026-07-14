/**
 * Contract: catalog card derivative path helper (H4).
 *
 *   ../backend/node_modules/.bin/tsx src/lib/catalog-card-image.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  catalogCardDerivativesEnabled,
  resolveCatalogCardHeroSrc,
  resolveCatalogCardImageSrc,
  resolveCatalogCardMediaBundle,
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
  toCatalogCardDerivativePath(
    "/static/products/oliver/ol-05-%D0%BD_legacy_main.jpg"
  ),
  "/static/products/oliver/derivatives/card/ol-05-н_legacy_main.webp"
)
assert.equal(
  resolveCatalogCardImageSrc(
    "http://localhost:9000/static/products/oliver/ol-05-%D0%BD_legacy_main.jpg",
    { preferDerivative: true }
  ),
  "/static/products/oliver/derivatives/card/ol-05-н_legacy_main.webp"
)

// Default preferDerivative is off
assert.equal(
  resolveCatalogCardImageSrc("/static/products/oliver/ol-01-1.png"),
  "/static/products/oliver/ol-01-1.png"
)
assert.equal(
  resolveCatalogCardImageSrc("/static/products/oliver/ol-01-1.png", {
    preferDerivative: true,
  }),
  "/static/products/oliver/derivatives/card/ol-01-1.webp"
)

const identity = (u: string) => u
const prev = process.env.NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES
delete process.env.NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES
assert.equal(catalogCardDerivativesEnabled(), false)
assert.equal(
  resolveCatalogCardHeroSrc("/static/products/oliver/ol-01-1.png", identity),
  "/static/products/oliver/ol-01-1.png"
)
process.env.NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES = "1"
assert.equal(catalogCardDerivativesEnabled(), true)
assert.equal(
  resolveCatalogCardHeroSrc("/static/products/oliver/ol-01-1.png", identity),
  "/static/products/oliver/derivatives/card/ol-01-1.webp"
)
assert.equal(
  resolveCatalogCardHeroSrc(
    "/product-static/products/greenwich/GR-09-1_main_01.png",
    identity
  ),
  "/product-static/products/greenwich/derivatives/card/GR-09-1_main_01.webp"
)
assert.deepEqual(
  resolveCatalogCardMediaBundle(
    "/product-static/products/greenwich/GR-05-1_greenwich_cream04.jpg",
    [
      "/product-static/products/greenwich/GR-05-1_greenwich_cream05.jpg",
      "/product-static/products/greenwich/GR-05-1_greenwich_cream06.jpg",
    ],
    identity
  ),
  {
    mainSrc:
      "/product-static/products/greenwich/derivatives/card/GR-05-1_greenwich_cream04.webp",
    extraSrcs: [
      "/product-static/products/greenwich/derivatives/card/GR-05-1_greenwich_cream05.webp",
      "/product-static/products/greenwich/derivatives/card/GR-05-1_greenwich_cream06.webp",
    ],
  }
)
if (prev === undefined) delete process.env.NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES
else process.env.NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES = prev

console.log("catalog-card-image.fidelity.test.ts: ok")
