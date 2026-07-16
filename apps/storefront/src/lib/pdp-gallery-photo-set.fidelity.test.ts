/**
 * PDP gallery parity: counter, thumbs, and fullscreen share one photo set.
 *
 *   ../backend/node_modules/.bin/tsx src/lib/pdp-gallery-photo-set.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  buildPdpGalleryPhotoSet,
  resolveBuyerGalleryThumbStrip,
  shouldShowBuyerGalleryRail,
} from "./pdp-gallery-photo-set"

const main = "/static/products/a/main.jpg"
const g1 = "/static/products/a/g1.jpg"
const g2 = "/static/products/a/g2.jpg"

{
  const photos = buildPdpGalleryPhotoSet(main, [g1, g2])
  assert.deepEqual(photos, [main, g1, g2])
  assert.equal(photos.length, 3)
  const thumbs = resolveBuyerGalleryThumbStrip(main, [g1, g2])
  assert.deepEqual(thumbs, photos, "thumbs must equal photo set (hero first)")
  assert.equal(thumbs[0], main, "primary must be first thumb")
  assert.ok(shouldShowBuyerGalleryRail(thumbs))
}

{
  /* Hero already present in strip — no duplicate. */
  const photos = buildPdpGalleryPhotoSet(main, [main, g1, g2, g1])
  assert.deepEqual(photos, [main, g1, g2])
  assert.deepEqual(resolveBuyerGalleryThumbStrip(main, [main, g1, g2, g1]), photos)
}

{
  /* Single photo: one thumb, counter = 1. */
  const photos = buildPdpGalleryPhotoSet(main, [])
  assert.deepEqual(photos, [main])
  assert.deepEqual(resolveBuyerGalleryThumbStrip(main, []), [main])
}

{
  /* Empty main, extras only. */
  assert.deepEqual(buildPdpGalleryPhotoSet("", [g1, g2]), [g1, g2])
  assert.deepEqual(resolveBuyerGalleryThumbStrip("  ", [g1]), [g1])
}

{
  /* Whitespace / non-string ignored. */
  // @ts-expect-error intentional junk in strip
  const photos = buildPdpGalleryPhotoSet(` ${main} `, ["", "  ", g1, null, g2])
  assert.deepEqual(photos, [main, g1, g2])
}

console.log("pdp-gallery-photo-set.fidelity.test.ts: ok")
