/**
 * Sparse chips point only at existing variants.
 * Run from apps/storefront:
 *   npx --yes tsx src/lib/sparse-variant-map.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  resolveSparseVariantId,
  sparseAxisChoices,
  sparseVariantMap,
  withVariantCapabilities,
} from "./sparse-variant-map"

function variant(
  id: string,
  sku: string,
  axes: Record<string, { label: string; display: string; sort: number }>,
  finish: string
) {
  return {
    id,
    sku,
    metadata: {
      variant_axes: axes,
      capabilities: { finish_color_executions: { [finish]: { name: finish } } },
      gallery_urls: [`/${sku}.jpg`],
    },
  }
}

const size = (display: string, sort: number) => ({
  label: "Размер спального места",
  display,
  sort,
})
const foot = (display: string, sort: number) => ({
  label: "Исполнение",
  display,
  sort,
})

const product = {
  metadata: {
    finish_color_executions: { survivor: { name: "survivor" } },
    paint_finish_executions: { must_drop: {} },
  },
  images: [{ url: "/survivor.jpg" }],
  variants: [
    variant("v90y", "OL-14-1", { mattress_size: size("90 × 190 см", 0), footboard: foot("С изножьем", 0) }, "oak"),
    variant("v90n", "OL-14-2", { mattress_size: size("90 × 190 см", 0), footboard: foot("Без изножья", 1) }, "ash"),
    variant("v120y", "OL-15-1", { mattress_size: size("120 × 190 см", 1), footboard: foot("С изножьем", 0) }, "oak"),
  ],
}

const map = sparseVariantMap(product)
assert.ok(map)
assert.deepEqual(
  map?.axes.map((axis) => axis.key),
  ["footboard", "mattress_size"]
)
assert.equal(resolveSparseVariantId(map, "missing"), "v90y")
assert.equal(resolveSparseVariantId(map, "v120y"), "v120y")

const rows = sparseAxisChoices(map!, "v90y")
const sizes = rows.find((row) => row.key === "mattress_size")
const feet = rows.find((row) => row.key === "footboard")
assert.deepEqual(
  sizes?.choices.map((choice) => [choice.label, choice.variantId, choice.isCurrent]),
  [
    ["90 × 190 см", "v90y", true],
    ["120 × 190 см", "v120y", false],
  ]
)
assert.deepEqual(
  feet?.choices.map((choice) => [choice.label, choice.variantId]),
  [
    ["С изножьем", "v90y"],
    ["Без изножья", "v90n"],
  ]
)
assert.equal(map?.variants.length, 3)
const fromWithout = sparseAxisChoices(map!, "v90n")
assert.equal(
  fromWithout.find((row) => row.key === "mattress_size"),
  undefined
)
assert.deepEqual(
  fromWithout.find((row) => row.key === "footboard")?.choices.map((choice) => choice.variantId),
  ["v90y", "v90n"]
)

const viewed = withVariantCapabilities(product, product.variants[1])
const meta = viewed.metadata as Record<string, unknown>
assert.deepEqual(meta.finish_color_executions, { ash: { name: "ash" } })
assert.equal("paint_finish_executions" in meta, false)
assert.equal((viewed.images as { url: string }[])[0].url, "/OL-14-2.jpg")

const collided = sparseVariantMap({
  variants: [
    variant("a", "A", { mattress_size: size("90 × 190 см", 0) }, "oak"),
    variant("b", "B", { mattress_size: size("90 × 190 см", 0) }, "ash"),
  ],
})
assert.equal(collided, null)

console.log("sparse-variant-map.fidelity.test.ts ok")
