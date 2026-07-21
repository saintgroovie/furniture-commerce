/**
 * Homepage media prefers catalog-card WebP when the bake flag is on.
 *
 *   yarn exec tsx src/components/home/home-image.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { resolveHomeImageSrc } from "./home-image"

const prev = process.env.NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES
delete process.env.NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES
assert.equal(
  resolveHomeImageSrc(
    "/product-static/products/greenwich/beds-shared/GR-BED-POOL_plane_greenwich_wideheader_View01_0f24-bk.jpg"
  ),
  "/product-static/products/greenwich/beds-shared/GR-BED-POOL_plane_greenwich_wideheader_View01_0f24-bk.jpg"
)

process.env.NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES = "1"
assert.equal(
  resolveHomeImageSrc(
    "/product-static/products/greenwich/beds-shared/GR-BED-POOL_plane_greenwich_wideheader_View01_0f24-bk.jpg"
  ),
  "/product-static/products/greenwich/beds-shared/derivatives/card/GR-BED-POOL_plane_greenwich_wideheader_View01_0f24-bk.webp"
)
assert.equal(
  resolveHomeImageSrc(
    "/product-static/products/greenwich/GR-05-1_greenwich_graphite05.jpg"
  ),
  "/product-static/products/greenwich/derivatives/card/GR-05-1_greenwich_graphite05.webp"
)

if (prev === undefined) delete process.env.NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES
else process.env.NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES = prev

console.log("home-image.fidelity.test.ts: ok")
