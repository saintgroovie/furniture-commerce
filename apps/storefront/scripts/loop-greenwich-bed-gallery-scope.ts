/**
 * Live LOOP A/B against a product JSON dump from Medusa store API.
 * Usage:
 *   yarn exec tsx scripts/loop-greenwich-bed-gallery-scope.ts /tmp/gr09-bed.json
 */
import { readFileSync } from "fs"
import {
  coerceGreenwichBedSelection,
  greenwichBedImageBasename,
  greenwichBedInteriorUrlsFromProduct,
  greenwichBedMatrixFromProduct,
  parseGreenwichBedComboKey,
  resolveGreenwichBedMedia,
} from "../src/lib/greenwich-bed-media"

const path = process.argv[2] || "/tmp/gr09-bed.json"
const cleaned = readFileSync(path, "utf8").replace(
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,
  " "
)
const d = JSON.parse(cleaned) as { products?: Record<string, unknown>[] }
const p = d.products?.[0]
if (!p) throw new Error(`no product in ${path}`)

const matrix = greenwichBedMatrixFromProduct(p)
const interiors = greenwichBedInteriorUrlsFromProduct(p)
console.log(
  "handle",
  p.handle,
  "title",
  p.title,
  "cells",
  matrix.length,
  "interiors",
  interiors.map(greenwichBedImageBasename)
)

let fails = 0
for (const cell of matrix) {
  const media = resolveGreenwichBedMedia(
    matrix,
    cell.headboard_model,
    cell.frame_material,
    cell.fabric_upholstery,
    { interiorUrls: interiors }
  )
  if (!media) {
    console.log("MISSING", cell.headboard_model, cell.combo_key)
    fails++
    continue
  }
  const active = (
    cell.combo_key || `${cell.frame_material}_${cell.fabric_upholstery}`
  ).toLowerCase()
  const all = [media.mainSrc, ...media.extraSrcs]
  for (const u of all) {
    const token = parseGreenwichBedComboKey(u)
    if (token && token !== active) {
      console.log("FOREIGN", cell.headboard_model, active, greenwichBedImageBasename(u))
      fails++
    }
    const b = greenwichBedImageBasename(u)
    if (!token && /gr-bed-pool_/.test(b) && !/bedroom\d*_int_|_int_view/i.test(b)) {
      console.log("UNSCOPED_POOL", cell.headboard_model, active, b)
      fails++
    }
  }
  if (cell.headboard_model === "frame" && active === "dark_darkblue") {
    console.log("FOCUS frame/dark_darkblue", all.map(greenwichBedImageBasename))
    console.log("  raw", (cell.urls || []).length, "scoped", all.length)
  }
}
console.log(fails === 0 ? "LOOP_A PASS" : `LOOP_A FAIL fails=${fails}`)

let loopBFails = 0
for (const hb of ["frame", "cloud", "plane"] as const) {
  const c = coerceGreenwichBedSelection(matrix, hb, "dark", "darkblue")
  const media = resolveGreenwichBedMedia(
    matrix,
    c.headboard,
    c.frameMaterial,
    c.fabric,
    { interiorUrls: interiors }
  )
  if (!media || c.headboard !== hb) {
    console.log("LOOP_B FAIL", hb, c, Boolean(media))
    loopBFails++
  } else {
    console.log(
      "LOOP_B",
      hb,
      "->",
      c,
      "ok",
      true,
      "extras",
      media.extraSrcs.length
    )
  }
}
if (loopBFails > 0) {
  console.log(`LOOP_B FAIL fails=${loopBFails}`)
  process.exitCode = 1
} else {
  console.log("LOOP_B PASS")
}
if (fails > 0) process.exitCode = 1
