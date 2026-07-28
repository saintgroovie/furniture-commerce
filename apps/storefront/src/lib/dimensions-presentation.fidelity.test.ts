/**
 *   ../backend/node_modules/.bin/tsx src/lib/dimensions-presentation.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  formatDimensionsCompact,
  formatDimensionsCompactLabeled,
  orderedBuyerFacingDimensions,
} from "./product-metadata"
import { formatBuyerFacingMeasureText } from "./buyer-measure-text"

{
  const dim = { height_mm: 900, width_mm: 1200, depth_mm: 450 }
  const compact = formatDimensionsCompact(dim)
  assert.ok(compact.includes("×"))
  assert.equal(compact.includes("*"), false)
  // H → W → D order in cm values
  assert.match(compact, /^90\u202F×\u202F120\u202F×\u202F45$/)
  const labeled = formatDimensionsCompactLabeled(dim)
  assert.equal(labeled.caption, "В × Ш × Г, см")
  assert.equal(labeled.values, compact)
}

{
  const dim = { height_mm: 900, width_mm: 1200, depth_mm: 0 }
  const compact = formatDimensionsCompact(dim)
  assert.match(compact, /^90\u202F×\u202F120$/)
  assert.equal(compact.split("\u202F×\u202F").length, 2)
  const axes = orderedBuyerFacingDimensions(dim).map((r) => r.axis)
  assert.deepEqual(axes, ["height", "width"])
}

{
  const dim = {
    height_mm: undefined as number | undefined,
    width_mm: undefined as number | undefined,
    depth_mm: undefined as number | undefined,
  }
  assert.equal(formatDimensionsCompact(dim), "")
}

{
  assert.equal(formatBuyerFacingMeasureText("90*200"), "90\u202F×\u202F200")
  assert.equal(formatBuyerFacingMeasureText("90 × 200"), "90\u202F×\u202F200")
}

console.log("dimensions-presentation.fidelity.test.ts: ok")
