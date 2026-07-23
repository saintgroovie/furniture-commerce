/**
 * Homepage media prefers catalog-card WebP for CATALOG_CARD surfaces when the
 * bake flag is on. Premium surfaces always keep originals (Option B).
 *
 *   yarn exec tsx src/components/home/home-image.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { resolveHomeImageSrc } from "./home-image"

const HERO =
  "/product-static/products/greenwich/beds-shared/GR-BED-POOL_plane_greenwich_wideheader_View01_0f24-bk.jpg"
const CRAFT =
  "/product-static/products/greenwich/GR-05-1_greenwich_graphite05.jpg"
const CARD =
  "/product-static/products/greenwich/GR-05-1_greenwich_graphite05.jpg"

const prev = process.env.NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES
delete process.env.NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES
assert.equal(resolveHomeImageSrc(HERO), HERO)
assert.equal(resolveHomeImageSrc(HERO, { surface: "HOME_HERO" }), HERO)

process.env.NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES = "1"
assert.equal(
  resolveHomeImageSrc(CARD, { surface: "CATALOG_CARD" }),
  "/product-static/products/greenwich/derivatives/card/GR-05-1_greenwich_graphite05.webp"
)
assert.equal(
  resolveHomeImageSrc(CARD),
  "/product-static/products/greenwich/derivatives/card/GR-05-1_greenwich_graphite05.webp"
)
assert.equal(resolveHomeImageSrc(HERO, { surface: "HOME_HERO" }), HERO)
assert.equal(resolveHomeImageSrc(CRAFT, { surface: "LIFESTYLE_BLOCK" }), CRAFT)

if (prev === undefined) delete process.env.NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES
else process.env.NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES = prev

console.log("home-image.fidelity.test.ts: ok")
