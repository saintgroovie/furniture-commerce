/**
 * Premium image surface contract (Option B).
 *
 *   yarn exec tsx src/components/home/premium-image-surface.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  HOME_IMAGE_SURFACES,
  homeImageSurfaceUsesCardDerivative,
  resolveHomeImageSrc,
  type HomeImageSurface,
} from "./home-image"

const HERO =
  "/product-static/products/greenwich/beds-shared/GR-BED-POOL_plane_greenwich_wideheader_View01_0f24-bk.jpg"
const ROOM =
  "/product-static/products/greenwich/beds-shared/GR-BED-POOL_cloud_bedroom2_int_View04.jpg"
const LIFESTYLE =
  "/product-static/products/greenwich/GR-05-1_greenwich_white04.jpg"
const CTA =
  "/product-static/products/greenwich/beds-shared/GR-BED-POOL_plane_greenwich_wideheader_View01_0f24-bk.jpg"
const CARD =
  "/product-static/products/oliver/OL-95-1_gallery_02.jpg"

assert.deepEqual([...HOME_IMAGE_SURFACES], [
  "CATALOG_CARD",
  "ROOM_COMPOSITION",
  "HOME_HERO",
  "KIDS_HERO",
  "LIFESTYLE_BLOCK",
  "LARGE_CTA",
])

assert.equal(homeImageSurfaceUsesCardDerivative("CATALOG_CARD"), true)
for (const surface of [
  "ROOM_COMPOSITION",
  "HOME_HERO",
  "KIDS_HERO",
  "LIFESTYLE_BLOCK",
  "LARGE_CTA",
] as HomeImageSurface[]) {
  assert.equal(homeImageSurfaceUsesCardDerivative(surface), false)
}

const prev = process.env.NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES
process.env.NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES = "1"

assert.equal(
  resolveHomeImageSrc(HERO, { surface: "HOME_HERO" }),
  HERO,
  "HOME_HERO must not receive card derivative"
)
assert.equal(
  resolveHomeImageSrc(HERO, { surface: "KIDS_HERO" }),
  HERO,
  "KIDS_HERO must not receive card derivative"
)
assert.equal(
  resolveHomeImageSrc(ROOM, { surface: "ROOM_COMPOSITION" }),
  ROOM,
  "ROOM_COMPOSITION must not receive card derivative"
)
assert.equal(
  resolveHomeImageSrc(LIFESTYLE, { surface: "LIFESTYLE_BLOCK" }),
  LIFESTYLE,
  "LIFESTYLE_BLOCK must not receive card derivative"
)
assert.equal(
  resolveHomeImageSrc(CTA, { surface: "LARGE_CTA" }),
  CTA,
  "LARGE_CTA must not receive card derivative"
)
assert.equal(
  resolveHomeImageSrc(CARD, { surface: "CATALOG_CARD" }),
  "/product-static/products/oliver/derivatives/card/OL-95-1_gallery_02.webp",
  "CATALOG_CARD must still prefer card derivative when flag on"
)

if (prev === undefined) delete process.env.NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES
else process.env.NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES = prev

console.log("premium-image-surface.fidelity.test.ts: ok")
