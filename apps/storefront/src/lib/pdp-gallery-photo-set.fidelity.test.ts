import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildPdpGalleryPhotoSet,
  resolveBuyerGalleryThumbStrip,
  shouldShowBuyerGalleryRail,
} from "./pdp-gallery-photo-set"

describe("buildPdpGalleryPhotoSet", () => {
  it("counts extras-only strip as full set (hero + one extra)", () => {
    const main = "/product-static/products/oliver/OL-05-1_gallery_01.jpg"
    const strip = ["/product-static/products/oliver/OL-05-1_gallery_02.jpg"]
    const set = buildPdpGalleryPhotoSet(main, strip)
    assert.deepEqual(set, [main, strip[0]])
    assert.equal(set.length > 1, true)
  })

  it("does not duplicate hero when strip already includes it", () => {
    const main = "/a.jpg"
    const strip = ["/a.jpg", "/b.jpg"]
    assert.deepEqual(buildPdpGalleryPhotoSet(main, strip), ["/a.jpg", "/b.jpg"])
  })

  it("single-photo product stays length 1", () => {
    assert.deepEqual(buildPdpGalleryPhotoSet("/only.jpg", []), ["/only.jpg"])
    assert.deepEqual(buildPdpGalleryPhotoSet("/only.jpg", ["/only.jpg"]), ["/only.jpg"])
  })

  it("empty main falls back to strip", () => {
    assert.deepEqual(buildPdpGalleryPhotoSet("", ["/a.jpg", "/b.jpg"]), [
      "/a.jpg",
      "/b.jpg",
    ])
  })
})

describe("resolveBuyerGalleryThumbStrip / shouldShowBuyerGalleryRail", () => {
  it("keeps extras-only PDP strip when extras exist", () => {
    const main = "/main.jpg"
    const strip = ["/extra.jpg"]
    assert.deepEqual(resolveBuyerGalleryThumbStrip(main, strip), strip)
    assert.equal(shouldShowBuyerGalleryRail(strip), true)
  })

  it("shows one-thumb rail for single-photo SKUs", () => {
    const main = "/only.jpg"
    const thumbs = resolveBuyerGalleryThumbStrip(main, [])
    assert.deepEqual(thumbs, [main])
    assert.equal(shouldShowBuyerGalleryRail(thumbs), true)
  })

  it("hides rail only when there is no photo at all", () => {
    assert.deepEqual(resolveBuyerGalleryThumbStrip("", []), [])
    assert.equal(shouldShowBuyerGalleryRail([]), false)
  })
})
