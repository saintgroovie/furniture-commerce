/**
 * Greenwich bed gallery scoping contract.
 * Run from apps/storefront:
 *   ../backend/node_modules/.bin/tsx src/lib/greenwich-bed-media.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  GREENWICH_BED_COMBO_KEYS,
  comboKeyFromDimensions,
  greenwichBedImageBasename,
  greenwichBedInteriorUrlsFromProduct,
  parseGreenwichBedComboKey,
  resolveGreenwichBedMedia,
  scopeGreenwichBedGalleryUrls,
  type GreenwichBedMatrixEntry,
} from "./greenwich-bed-media"

function cell(
  hb: string,
  wood: string,
  fabric: string,
  urls: string[]
): GreenwichBedMatrixEntry {
  return {
    headboard_model: hb,
    frame_material: wood,
    fabric_upholstery: fabric,
    combo_key: `${wood}_${fabric}`,
    urls,
  }
}

const CONTAMINATED: GreenwichBedMatrixEntry[] = [
  cell("frame", "dark", "darkblue", [
    "/static/products/greenwich/beds/greenwich_frame_dark_darkblue.jpg",
    "/static/products/greenwich/beds/GR-BED-POOL_frame_01.jpg",
    "/static/products/greenwich/beds/greenwich_frame_natural_beige.jpg",
    "/static/products/greenwich/beds/greenwich_frame_dark_beige.jpg",
    "/static/products/greenwich/beds/greenwich_frame_natural_darkblue.jpg",
    "/static/products/greenwich/beds/greenwich_frame_dark_darkblue_detail.jpg",
    "/static/products/greenwich/beds/bedroom1_int_view.jpg",
  ]),
]

{
  assert.equal(parseGreenwichBedComboKey("greenwich_frame_dark_darkblue.jpg"), "dark_darkblue")
  assert.equal(parseGreenwichBedComboKey("x?natural_beige=1"), null)
  assert.equal(
    parseGreenwichBedComboKey("/path/greenwich_frame_natural_beige.jpg?v=1#h"),
    "natural_beige"
  )
  assert.equal(parseGreenwichBedComboKey("GR-BED-POOL_frame_01.jpg"), null)
  assert.equal(comboKeyFromDimensions("dark", "darkblue"), "dark_darkblue")
  for (const k of GREENWICH_BED_COMBO_KEYS) {
    assert.equal(parseGreenwichBedComboKey(`hero_${k}.jpg`), k)
  }
}

{
  const scoped = scopeGreenwichBedGalleryUrls(CONTAMINATED[0]!.urls, "dark_darkblue")
  assert.ok(scoped)
  assert.match(scoped!.mainSrc, /dark_darkblue/)
  const bases = [scoped!.mainSrc, ...scoped!.extraSrcs].map(greenwichBedImageBasename)
  assert.ok(bases.some((b) => b.includes("dark_darkblue_detail")))
  /* Cell-only interiors must NOT leak — provenance is shared_scene_media. */
  assert.ok(!bases.some((b) => b.includes("bedroom1_int_view")))
  assert.ok(!bases.some((b) => b.includes("natural_beige")))
  assert.ok(!bases.some((b) => b.includes("dark_beige") && !b.includes("dark_darkblue")))
  assert.ok(!bases.some((b) => b.includes("natural_darkblue")))
  assert.ok(!bases.some((b) => b.includes("gr-bed-pool_frame_01")))
}

{
  const media = resolveGreenwichBedMedia(CONTAMINATED, "frame", "dark", "darkblue")
  assert.ok(media)
  const extras = media!.extraSrcs.map(greenwichBedImageBasename)
  assert.ok(!extras.some((b) => /natural_beige|dark_beige|natural_darkblue|gr-bed-pool|bedroom/.test(b)))
}

{
  const media = resolveGreenwichBedMedia(CONTAMINATED, "frame", "dark", "darkblue", {
    interiorUrls: ["/static/products/greenwich/beds-shared/bedroom2_int_view.jpg"],
  })
  assert.ok(media)
  const bases = media!.extraSrcs.map(greenwichBedImageBasename)
  assert.ok(bases.includes("bedroom2_int_view.jpg"))
  assert.ok(!bases.includes("bedroom1_int_view.jpg"))
  /* Order: combo detail before shared interior */
  const detailIdx = bases.findIndex((b) => b.includes("dark_darkblue_detail"))
  const intIdx = bases.indexOf("bedroom2_int_view.jpg")
  assert.ok(detailIdx >= 0 && intIdx > detailIdx)
}

{
  const interiors = greenwichBedInteriorUrlsFromProduct({
    metadata: {
      shared_scene_media: [
        {
          key: "interior",
          scene_type: "interior",
          urls: ["/a/bedroom1_int_.jpg", "/a/bedroom1_int_.jpg"],
        },
        { key: "other", scene_type: "detail", urls: ["/a/should-skip.jpg"] },
      ],
    },
  })
  assert.deepEqual(interiors, ["/a/bedroom1_int_.jpg"])
}

{
  /* Allowlisted neutral detail may stay; unlisted pool still drops. */
  const scoped = scopeGreenwichBedGalleryUrls(
    [
      "/static/x/greenwich_frame_dark_darkblue.jpg",
      "/static/x/GR-BED-POOL_frame_01.jpg",
      "/static/x/approved_neutral.jpg",
    ],
    "dark_darkblue",
    { neutralDetailAllowlist: new Set(["approved_neutral.jpg"]) }
  )
  assert.ok(scoped)
  const bases = scoped!.extraSrcs.map(greenwichBedImageBasename)
  assert.deepEqual(bases, ["approved_neutral.jpg"])
}

console.log("greenwich-bed-media.fidelity.test.ts: ok")
