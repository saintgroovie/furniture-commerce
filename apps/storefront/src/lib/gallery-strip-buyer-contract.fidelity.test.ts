/**
 * Buyer gallery strip split contract (card vs PDP) + rail gates + Oliver helper.
 *
 *   ../backend/node_modules/.bin/tsx src/lib/gallery-strip-buyer-contract.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  buildGalleryStripUrls,
  buildPdpThumbStripUrls,
} from "./product-images"
import { buildPdpGalleryPhotoSet } from "./pdp-gallery-photo-set"
import { buildOliverPdpThumbStripUrls } from "./oliver-pdp-thumb-strip"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "..")
const corePath = path.join(root, "components/product-card-media-gallery-core.tsx")
const pdpPath = path.join(root, "components/product-pdp-media-switcher.tsx")
const oliverSwitcherPath = path.join(
  root,
  "components/oliver-pdp-media-switcher.tsx"
)
const oliverStripPath = path.join(root, "lib/oliver-pdp-thumb-strip.ts")

{
  const main = "http://localhost:9000/static/x/main.jpg"
  const extras = ["http://localhost:9000/static/x/extra-1.jpg"]
  const card = buildGalleryStripUrls(main, extras)
  const pdp = buildPdpThumbStripUrls(main, extras)
  assert.deepEqual(card, [main, extras[0]])
  assert.deepEqual(pdp, [extras[0]])
  assert.equal(buildPdpGalleryPhotoSet(main, pdp).length, 2)
  // Default Oliver path (non color-hero pair) stays extras-only.
  assert.deepEqual(buildOliverPdpThumbStripUrls(main, extras), pdp)
}

{
  const core = readFileSync(corePath, "utf8")
  assert.match(
    core,
    /if \(layout === "pdp"\) \{\s*return buildPdpThumbStripUrls/,
    "gallery core PDP path must use extras-only strip"
  )
  assert.match(
    core,
    /return buildGalleryStripUrls\(\s*cardQualityMedia\.mainSrc/,
    "gallery core card path must use main-first strip"
  )
  assert.match(
    core,
    /shouldShowBuyerGalleryRail\(thumbStrip\)/,
    "core must show gallery rail for any non-empty thumb strip (incl. single-photo)"
  )
  assert.match(
    core,
    /resolveBuyerGalleryThumbStrip/,
    "core must resolve single-photo PDP fallback to main thumb"
  )
  assert.match(
    core,
    /isPdpLayout\s*\?\s*\{\s*mode:\s*"optimistic"\s*\}/,
    "PDP execution switches must not clear and Image()-reprobe the strip"
  )
  assert.match(
    core,
    /image\.decode\(\)\.then\(\(\) => finish\(true\)\)/,
    "PDP execution hero must decode before replacing the painted image"
  )
  assert.match(
    core,
    /executionSwapSeqRef\.current !== seq/,
    "rapid PDP execution clicks must use last-write-wins sequence gating"
  )
  assert.match(
    core,
    /if \(!ready\) \{[\s\S]*?setDisplayHeroSrc\(""\)[\s\S]*?setHeroFailed\(true\)/,
    "failed selected hero must not leave the previous execution photo painted"
  )
  assert.match(
    core,
    /executionHeroPreloadRef\.current\.get\(normalized\) === pending/,
    "an older failed preload must not evict a newer request for the same URL"
  )
  assert.match(
    core,
    /isGreenwichPaint \|\| isProvencePaintWood[\s\S]*?visibleWoodVariants\.length >= 1/,
    "Greenwich wood row must remain visible with one available frame"
  )
  assert.match(
    core,
    /availableFabricKeysForHeadboardAnyWood/,
    "Greenwich bed fabric row must stay stable across wood changes"
  )
  assert.match(
    core,
    /coerceGreenwichBedSelectionFabricFirst/,
    "Greenwich bed fabric clicks must preserve the clicked fabric"
  )
  assert.equal(
    /withExtrasFallback/.test(core),
    false,
    "must not use unscoped withExtrasFallback helper"
  )
  assert.match(
    core,
    /fromPaint\.extraSrcs\.length > 0/,
    "paint matrix must prefer real extras when present"
  )
  assert.match(
    core,
    /activeFinish\?\.extraSrcs/,
    "paint slim urls must fall back to same-token finish extras, not foreign finishes"
  )
  assert.equal(
    /extraSrcs\.length > 0 \? extraSrcs : fromPaint/.test(core),
    false,
    "paint empty extras must not fall back to unscoped parent extraSrcs"
  )
  assert.equal(
    /extraSrcs\.length > 0 \? extraSrcs : fromMatrix/.test(core),
    false,
    "matrix empty extras must not fall back to unscoped parent extraSrcs"
  )
  assert.match(
    core,
    /fromMatrix\.extraSrcs\.length > 0/,
    "bed matrix must prefer real extras when present"
  )

  // Empty scoped extras: card = main-only strip (rail still shown); PDP extras-only
  // empty → photo-set length 1 → rail shows main via resolveBuyerGalleryThumbStrip.
  {
    const main = "http://localhost:9000/static/x/fabric-a-main.jpg"
    const parentPollution = ["http://localhost:9000/static/x/fabric-b-angle.jpg"]
    const scopedExtras: string[] = []
    const card = buildGalleryStripUrls(main, scopedExtras)
    const pdp = buildPdpThumbStripUrls(main, scopedExtras)
    assert.deepEqual(card, [main])
    assert.deepEqual(pdp, [])
    assert.equal(buildPdpGalleryPhotoSet(main, pdp).length, 1)
    assert.equal(
      card.includes(parentPollution[0]!),
      false,
      "card strip must not invent parent extras"
    )
  }

  const pdp = readFileSync(pdpPath, "utf8")
  assert.match(pdp, /buildPdpThumbStripUrls\(/)
  assert.equal(
    pdp.includes("buildGalleryStripUrls"),
    false,
    "generic PDP switcher must stay extras-only"
  )
  assert.match(
    pdp,
    /shouldShowBuyerGalleryRail\(thumbStrip\)/,
    "generic PDP rail must show for any non-empty thumb strip"
  )

  const oliverUi = readFileSync(oliverSwitcherPath, "utf8")
  assert.match(
    oliverUi,
    /shouldShowBuyerGalleryRail\(thumbStrip\)/,
    "Oliver PDP rail must show for any non-empty thumb strip"
  )

  const oliverStrip = readFileSync(oliverStripPath, "utf8")
  assert.match(oliverStrip, /detectOliverGalleryColorHeroPair/)
  assert.match(oliverStrip, /return buildPdpThumbStripUrls/)
  assert.match(oliverStrip, /return buildGalleryStripUrls/)

  const cardPath = path.join(root, "components/product-card.tsx")
  const cardSrc = readFileSync(cardPath, "utf8")
  assert.equal(
    /primaryExtras\.length > 0/.test(cardSrc),
    false,
    "product-card must not use legacy unscoped primaryExtras refill"
  )
  assert.match(
    cardSrc,
    /collectSameExecutionExtraImageUrls/,
    "product-card must same-token fill when catalog slimmed urls:[main]"
  )
  assert.match(
    cardSrc,
    /pickMain/,
    "product-card must keep pickMain for empty wood.mainSrc"
  )
  assert.match(
    cardSrc,
    /resolveCatalogCardMediaBundle\(\s*storefrontBundle\.mainSrc/,
    "card must resolve execution hero to derivative before first client paint"
  )
}

console.log("gallery-strip-buyer-contract.fidelity.test.ts: ok")
