/**
 * Catalog card / PDP: evidence-backed near-dup collapse + strip contracts.
 *
 * Card: main-first (return-to-main). PDP: extras-only (no hero duplicate in rail).
 *
 *   ../backend/node_modules/.bin/tsx src/lib/catalog-card-gallery-dedupe.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  areNearDuplicateProductImages,
  buildGalleryStripUrls,
  buildPdpThumbStripUrls,
  galleryAssetStemKey,
  isCatalogDerivativeOriginalPair,
  productImageQualityScore,
  resolveCardHeroAndNearDuplicateExtras,
} from "./product-images"
import { buildIntraProductExecutionSelectors } from "./card-color-media"
import {
  mediaNearDupCollapseForHandle,
  restoreEvidenceProtectedAngles,
} from "./media-near-dup-collapse"
import { buildPdpGalleryPhotoSet } from "./pdp-gallery-photo-set"

assert.equal(
  galleryAssetStemKey(
    "/product-static/products/greenwich/derivatives/card/GR-09-1_main_01.webp"
  ),
  galleryAssetStemKey("/product-static/products/greenwich/GR-09-1_main_01.png"),
  "catalog derivative webp and original must share stem identity"
)
assert.equal(
  isCatalogDerivativeOriginalPair(
    "/product-static/products/greenwich/derivatives/card/GR-09-1_main_01.webp",
    "/product-static/products/greenwich/GR-09-1_main_01.png"
  ),
  true,
  "derivative↔original is a catalog card pair"
)
assert.equal(
  isCatalogDerivativeOriginalPair(
    "/product-static/products/greenwich/GR-09-1_main_01.jpg",
    "/product-static/products/greenwich/GR-09-1_main_01.png"
  ),
  false,
  "same stem different ext without derivatives/card must NOT pair"
)
assert.equal(
  isCatalogDerivativeOriginalPair(
    "/product-static/products/greenwich/derivatives/card/GR-09-1_main_01.gif",
    "/product-static/products/greenwich/GR-09-1_main_01.png"
  ),
  false,
  "non-webp under derivatives/card must NOT pair"
)
{
  const resolved = resolveCardHeroAndNearDuplicateExtras(
    "/product-static/products/greenwich/derivatives/card/GR-09-1_main_01.webp",
    ["/product-static/products/greenwich/GR-09-1_main_01.png"],
    "greenwich-gr-09-1-mirror"
  )
  assert.equal(resolved.extraSrcs.length, 0, "derivative↔original must not duplicate on card strip")
  const strip = buildGalleryStripUrls(resolved.mainSrc, resolved.extraSrcs)
  assert.equal(strip.length, 1)
}
{
  const resolved = resolveCardHeroAndNearDuplicateExtras(
    "/product-static/products/greenwich/GR-09-1_main_01.jpg",
    ["/product-static/products/greenwich/GR-09-1_main_01.png"],
    "greenwich-gr-09-1-ext-pair"
  )
  assert.equal(
    resolved.extraSrcs.length,
    1,
    "jpg↔png same stem without derivatives/card must stay as distinct extras"
  )
}

assert.equal(
  areNearDuplicateProductImages(
    "http://localhost:9000/static/x/fa-05-3-iso.jpg",
    "http://localhost:9000/static/x/fa-05-3-iso-1.jpg"
  ),
  false,
  "filename twins must not collapse without evidence"
)
assert.equal(
  areNearDuplicateProductImages(
    "http://localhost:9000/static/x/te-62-1-iso-1.jpg",
    "http://localhost:9000/static/x/te-62-1-iso-2.jpg"
  ),
  false
)
assert.equal(
  areNearDuplicateProductImages(
    "http://localhost:9000/static/x/ol-84-1-i2.jpg",
    "http://localhost:9000/static/x/ol-84-1-i2.jpg"
  ),
  true
)
assert.ok(
  productImageQualityScore("http://x/fa-05-3-iso-1.jpg") >
    productImageQualityScore("http://x/fa-05-3-iso.jpg")
)

{
  const resolved = resolveCardHeroAndNearDuplicateExtras(
    "http://localhost:9000/static/products/willie-winkie/fa-05-3-iso.jpg",
    [
      "http://localhost:9000/static/products/willie-winkie/fa-05-3-iso-1.jpg",
      "http://localhost:9000/static/products/willie-winkie/fa-05-3-iso-2.jpg",
    ],
    "fa-05-3"
  )
  assert.match(resolved.mainSrc, /fa-05-3-iso\.jpg$/)
  assert.deepEqual(
    resolved.extraSrcs.map((u) => u.split("/").pop()),
    ["fa-05-3-iso-1.jpg", "fa-05-3-iso-2.jpg"]
  )
  const cardStrip = buildGalleryStripUrls(resolved.mainSrc, resolved.extraSrcs)
  assert.deepEqual(
    cardStrip.map((u) => u.split("/").pop()),
    ["fa-05-3-iso.jpg", "fa-05-3-iso-1.jpg", "fa-05-3-iso-2.jpg"],
    "card strip must lead with main so return-to-main is selectable"
  )
  const pdpStrip = buildPdpThumbStripUrls(resolved.mainSrc, resolved.extraSrcs)
  assert.deepEqual(
    pdpStrip.map((u) => u.split("/").pop()),
    ["fa-05-3-iso-1.jpg", "fa-05-3-iso-2.jpg"],
    "PDP strip stays extras-only (no hero duplicate in rail)"
  )
  assert.equal(
    buildPdpGalleryPhotoSet(resolved.mainSrc, pdpStrip).length,
    3,
    "PDP rail/lightbox count uses hero + extras"
  )
}

{
  const solo = buildGalleryStripUrls(
    "http://localhost:9000/static/x/solo.jpg",
    []
  )
  assert.deepEqual(solo, ["http://localhost:9000/static/x/solo.jpg"])
  assert.equal(solo.length, 1)
}

{
  assert.equal(mediaNearDupCollapseForHandle("av-05-1"), null)
  const resolved = resolveCardHeroAndNearDuplicateExtras(
    "http://localhost:9000/static/products/willie-winkie/av-05-1-iso-1_il9e-v6.jpg",
    [
      "http://localhost:9000/static/products/willie-winkie/av-05-1-iso_hvyo-8t.jpg",
    ],
    "av-05-1"
  )
  assert.match(resolved.mainSrc, /iso-1_il9e-v6\.jpg$/)
  assert.equal(resolved.extraSrcs.length, 1)
  assert.match(resolved.extraSrcs[0]!, /iso_hvyo-8t\.jpg$/)

  const restored = restoreEvidenceProtectedAngles(
    "av-05-1",
    [
      "http://localhost:9000/static/products/willie-winkie/av-05-1-iso-1_il9e-v6.jpg",
    ],
    [
      "http://localhost:9000/static/products/willie-winkie/av-05-1-iso-1_il9e-v6.jpg",
      "http://localhost:9000/static/products/willie-winkie/av-05-1-iso_hvyo-8t.jpg",
    ]
  )
  assert.equal(restored.length, 2)
  assert.match(restored[1]!, /iso_hvyo-8t\.jpg$/)
}

{
  const entry = mediaNearDupCollapseForHandle("ol-84-1")
  assert.ok(entry)
  assert.ok(
    entry!.drop_basenames.some((b) => /gallery_01/i.test(b)),
    "ol-84-1 must list gallery_01 as drop"
  )
  const resolved = resolveCardHeroAndNearDuplicateExtras(
    "http://localhost:9000/static/products/oliver/ol-84-1-i2.jpg",
    [
      "http://localhost:9000/static/products/oliver/ol-84-1_gallery_01.jpg",
      "http://localhost:9000/static/products/oliver/OL-84-1_gallery_02.jpg",
    ],
    "ol-84-1"
  )
  assert.match(resolved.mainSrc.toLowerCase(), /ol-84-1-i2\.jpg$/)
  assert.deepEqual(
    resolved.extraSrcs.map((u) => u.split("/").pop()!.toLowerCase()),
    ["ol-84-1_gallery_02.jpg"]
  )
}

{
  const product = {
    handle: "ol-82-1",
    thumbnail:
      "http://localhost:9000/static/products/oliver/OL-82-1_color_torno_02.jpg",
    images: [
      {
        url: "http://localhost:9000/static/products/oliver/OL-82-1_color_torno_02.jpg",
      },
      {
        url: "http://localhost:9000/static/products/oliver/OL-82-1_color_torno_01.jpg",
      },
      {
        url: "http://localhost:9000/static/products/oliver/OL-82-1_color_torno_03.jpg",
      },
      {
        url: "http://localhost:9000/static/products/oliver/OL-82-1_color_torno_04.jpg",
      },
    ],
    metadata: {
      collection: "oliver-kids",
      fabric_upholstery_executions: [
        {
          key: "torno",
          label: "torno",
          urls: [
            "/static/products/oliver/OL-82-1_color_torno_02.jpg",
            "/static/products/oliver/OL-82-1_color_torno_01.jpg",
          ],
        },
        {
          key: "linda",
          label: "linda",
          urls: [
            "/static/products/oliver/OL-82-1_color_linda_02.jpg",
            "/static/products/oliver/OL-82-1_color_linda_01.jpg",
          ],
        },
      ],
    },
  }
  const main =
    "http://localhost:9000/static/products/oliver/OL-82-1_color_torno_02.jpg"
  const selectors = buildIntraProductExecutionSelectors(product, main)
  const torno = selectors.separateFabricRows?.find((v) => v.key === "torno")
  assert.ok(torno)
  assert.equal(torno!.extraSrcs.length, 1)
  assert.ok(torno!.extraSrcs.every((u) => !/torno_0[34]/i.test(u)))
}

console.log("catalog-card-gallery-dedupe.fidelity.test.ts: ok")
