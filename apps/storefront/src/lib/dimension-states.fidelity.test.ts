/**
 * Buyer dimension cells: scalar products stay one number.
 * Discrete height positions render as 85 / 114, not a range and not a SKU rule.
 *
 *   yarn dlx tsx src/lib/dimension-states.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  formatDimensionsCompact,
  getDimensions,
  pdpDimensionCells,
} from "./product-metadata"

const scalar = getDimensions({
  metadata: {
    dimensions: { height_mm: 900, width_mm: 1200, depth_mm: 450 },
  },
})
assert.ok(scalar)
assert.equal(scalar.height_mm, 900)
assert.equal(scalar.axis_states, undefined)
assert.deepEqual(
  pdpDimensionCells(scalar).map((cell) => cell.axis),
  ["height", "width", "depth"]
)
assert.equal(formatDimensionsCompact(scalar), "90\u202F×\u202F120\u202F×\u202F45")

const dual = getDimensions({
  handle: "not-a-rule",
  metadata: {
    dimensions: {
      width_mm: 1202,
      depth_mm: 502,
      axis_states: [
        {
          axis: "height",
          values_mm: [850, 1140],
          note: "два положения зеркального блока",
        },
      ],
    },
  },
})
assert.ok(dual)
assert.equal(dual.height_mm, undefined)
assert.equal(dual.width_mm, 1202)
assert.equal(dual.depth_mm, 502)
const cells = pdpDimensionCells(dual)
assert.deepEqual(
  cells.map((cell) => cell.axis),
  ["height", "width", "depth"]
)
assert.deepEqual(cells[0].values_mm, [850, 1140])
assert.equal(cells[0].note, "два положения зеркального блока")
assert.equal(cells[1].mm, 1202)
assert.equal(formatDimensionsCompact(dual), "85/114\u202F×\u202F120\u202F×\u202F50")

const noSkuBranch = getDimensions({
  metadata: {
    sku: "PR-06-1",
    dimensions: { height_mm: 800, width_mm: 1000, depth_mm: 400 },
  },
})
assert.equal(noSkuBranch?.height_mm, 800)
assert.equal(noSkuBranch?.axis_states, undefined)

const variantWins = getDimensions(
  {
    metadata: {
      dimensions: {
        axis_states: [{ axis: "height", values_mm: [850, 1140], note: null }],
      },
    },
  },
  {
    metadata: { dimensions: { height_mm: 800, width_mm: 1000, depth_mm: 400 } },
  }
)
assert.equal(variantWins?.height_mm, 800)
assert.equal(variantWins?.axis_states, undefined)

const normalizedOnly = getDimensions({
  metadata: {
    dimensions: {},
    dimensions_normalized: {
      width_mm: 1202,
      depth_mm: 502,
      axis_states: [{ axis: "height", values_mm: [850, 1140], note: null }],
    },
  },
})
assert.ok(normalizedOnly)
assert.deepEqual(normalizedOnly.axis_states?.[0]?.values_mm, [850, 1140])
assert.equal(normalizedOnly.width_mm, 1202)
assert.equal(normalizedOnly.height_mm, undefined)

const ordinary = getDimensions({
  metadata: { dimensions: { height_mm: 850, width_mm: 1202, depth_mm: 502 } },
})
assert.equal(ordinary?.height_mm, 850)
assert.equal(ordinary?.axis_states, undefined)
assert.deepEqual(
  pdpDimensionCells(ordinary!).map((cell) => [cell.axis, cell.mm, cell.values_mm]),
  [
    ["height", 850, undefined],
    ["width", 1202, undefined],
    ["depth", 502, undefined],
  ]
)

const labeled = getDimensions({
  metadata: {
    dimensions: {
      width_mm: 1202,
      depth_mm: 502,
      axis_states: [
        {
          axis: "height",
          positions: [
            { value_mm: 850, label: "Зеркало опущено" },
            { value_mm: 1140, label: "Зеркало поднято" },
          ],
        },
      ],
    },
  },
})
const labeledCells = pdpDimensionCells(labeled!)
assert.equal(labeled?.height_mm, undefined)
assert.deepEqual(labeledCells[0].values_mm, [850, 1140])
assert.deepEqual(labeledCells[0].labels, ["Зеркало опущено", "Зеркало поднято"])
assert.equal(labeledCells[0].note, null)
assert.deepEqual(
  labeledCells.map((cell) => cell.axis),
  ["height", "width", "depth"]
)
assert.equal(formatDimensionsCompact(labeled!), "85/114\u202F×\u202F120\u202F×\u202F50")
assert.ok(!formatDimensionsCompact(labeled!).includes("–"))

const both = getDimensions({
  metadata: {
    dimensions: {
      height_mm: 850,
      width_mm: 1202,
      depth_mm: 502,
      axis_states: [
        {
          axis: "height",
          positions: [
            { value_mm: 850, label: "Зеркало опущено" },
            { value_mm: 1140, label: "Зеркало поднято" },
          ],
        },
      ],
    },
  },
})
const bothCells = pdpDimensionCells(both!)
assert.equal(bothCells.filter((cell) => cell.axis === "height").length, 1)
assert.deepEqual(bothCells[0].values_mm, [850, 1140])
assert.equal(both?.height_mm, undefined)

const malformed = getDimensions({
  metadata: {
    dimensions: {
      height_mm: 850,
      width_mm: 1202,
      depth_mm: 502,
      axis_states: [
        {
          axis: "height",
          positions: [
            { value_mm: 850, label: "Зеркало опущено" },
            { value_mm: 850, label: "Зеркало поднято" },
          ],
        },
      ],
    },
  },
})
assert.equal(malformed?.height_mm, undefined)
assert.equal(malformed?.axis_states, undefined)
assert.equal(malformed?.width_mm, 1202)
assert.equal(malformed?.depth_mm, 502)
assert.ok(!pdpDimensionCells(malformed!).some((cell) => cell.axis === "height"))

console.log("dimension-states.fidelity.test.ts: ok")
