/**
 *   yarn dlx tsx src/lib/dimensions-presentation.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  formatDimensionsCompact,
  formatDimensionsCompactLabeled,
  getDimensions,
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

// Variant-first + per-axis product fallback (selected variant, not first).
{
  const product = {
    metadata: {
      dimensions: { height_mm: 800, width_mm: 1000, depth_mm: 400 },
    },
    variants: [
      {
        id: "var_a",
        metadata: {
          dimensions: { height_mm: 900, width_mm: 1200, depth_mm: 450 },
        },
      },
      {
        id: "var_b",
        metadata: {
          dimensions: { height_mm: 950, width_mm: 1400 },
        },
      },
    ],
  }
  const a = getDimensions(product, product.variants[0])
  const b = getDimensions(product, product.variants[1])
  assert.deepEqual(a, { height_mm: 900, width_mm: 1200, depth_mm: 450 })
  // depth falls back to product for variant B
  assert.deepEqual(b, { height_mm: 950, width_mm: 1400, depth_mm: 400 })
  // zeros on variant → product fallback
  const zeroVar = getDimensions(product, {
    id: "var_z",
    metadata: { dimensions: { height_mm: 0, width_mm: 0, depth_mm: 0 } },
  })
  assert.deepEqual(zeroVar, { height_mm: 800, width_mm: 1000, depth_mm: 400 })
}

{
  assert.equal(formatBuyerFacingMeasureText("90*200"), "90\u202F×\u202F200")
  assert.equal(formatBuyerFacingMeasureText("90 × 200"), "90\u202F×\u202F200")
}

console.log("dimensions-presentation.fidelity.test.ts: ok")
