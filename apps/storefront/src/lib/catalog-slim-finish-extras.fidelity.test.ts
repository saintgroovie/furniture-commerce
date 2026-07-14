/**
 * Catalog slim finish urls:[main] must still get same-token gallery extras
 * from product.images (never other finishes).
 *
 *   ../backend/node_modules/.bin/tsx src/lib/catalog-slim-finish-extras.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  collectSameExecutionExtraImageUrls,
  enrichCardColorVariantsWithCatalogExtras,
} from "./card-color-media"
import {
  buildGalleryStripUrls,
  resolveCardHeroAndNearDuplicateExtras,
} from "./product-images"

const scaleSlim = {
  handle: "greenwich-gr-05-1",
  thumbnail: "/static/products/greenwich/GR-05-1_greenwich_white04.jpg",
  images: [
    { url: "/static/products/greenwich/GR-05-1_greenwich_white04.jpg" },
    { url: "/static/products/greenwich/GR-05-1_greenwich_white05.jpg" },
    { url: "/static/products/greenwich/GR-05-1_greenwich_white06.jpg" },
    { url: "/static/products/greenwich/GR-05-1_greenwich_graphite04.jpg" },
    { url: "/static/products/greenwich/GR-05-1_greenwich_graphite05.jpg" },
  ],
  metadata: {
    finish_color_executions: [
      {
        key: "white",
        label: "Белый",
        urls: ["/static/products/greenwich/GR-05-1_greenwich_white04.jpg"],
      },
      {
        key: "graphite",
        label: "Графит",
        urls: ["/static/products/greenwich/GR-05-1_greenwich_graphite04.jpg"],
      },
    ],
  },
}

{
  const extras = collectSameExecutionExtraImageUrls(
    scaleSlim,
    scaleSlim.thumbnail,
    "white"
  )
  assert.deepEqual(
    extras.map((u) => u.split("/").pop()),
    [
      "GR-05-1_greenwich_white05.jpg",
      "GR-05-1_greenwich_white06.jpg",
    ],
    "same-token fill must exclude graphite frames"
  )
  assert.ok(
    extras.every((u) => u.startsWith("/product-static/")),
    "catalog extras must use /product-static rewrite ( /static 404 on storefront )"
  )
  const foreign = collectSameExecutionExtraImageUrls(
    {
      ...scaleSlim,
      images: [
        ...scaleSlim.images,
        { url: "/static/products/greenwich/GR-05-1_greenwich_red05.jpg" },
        { url: "/static/products/oliver/ol-01-1-iso.jpg" },
      ],
    },
    scaleSlim.thumbnail,
    "white"
  )
  assert.equal(
    foreign.some((u) => /red05|ol-01/i.test(u)),
    false,
    "tokenless / foreign finish assets must not enter white bucket"
  )
  const resolved = resolveCardHeroAndNearDuplicateExtras(
    scaleSlim.thumbnail,
    extras,
    scaleSlim.handle
  )
  const strip = buildGalleryStripUrls(resolved.mainSrc, resolved.extraSrcs)
  assert.ok(strip.length >= 3, "catalog Scale strip must be multi-photo after same-token fill")
}

{
  const enriched = enrichCardColorVariantsWithCatalogExtras(
    [
      {
        key: "white",
        label: "Белый",
        mainSrc: scaleSlim.thumbnail,
        extraSrcs: [],
      },
      {
        key: "graphite",
        label: "Графит",
        mainSrc: "/static/products/greenwich/GR-05-1_greenwich_graphite04.jpg",
        extraSrcs: [],
      },
    ],
    scaleSlim
  )
  assert.ok(enriched)
  assert.deepEqual(
    enriched![0]!.extraSrcs.map((u) => u.split("/").pop()),
    ["GR-05-1_greenwich_white05.jpg", "GR-05-1_greenwich_white06.jpg"]
  )
  assert.deepEqual(
    enriched![1]!.extraSrcs.map((u) => u.split("/").pop()),
    ["GR-05-1_greenwich_graphite05.jpg"]
  )
}

console.log("catalog-slim-finish-extras.fidelity.test.ts: ok")
