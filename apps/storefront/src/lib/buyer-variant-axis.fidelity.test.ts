/**
 * Variant chips come from this product's variants, never from a sibling PDP
 * and never from the furniture envelope.
 * Run from apps/storefront:
 *   npx --yes tsx src/lib/buyer-variant-axis.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { buyerVariantAxis, resolveBuyerVariantId, variantChipTarget } from "./buyer-variant-axis"

const body = { depth_mm: 2207, width_mm: 1930, height_mm: 1050 }

function variant(id: string, sku: string, width: number, length: number) {
  return {
    id,
    sku,
    metadata: {
      dimensions: { ...body, width_mm: width * 10 + 130 },
      mattress_size: {
        key: `${width}x${length}`,
        width_cm: width,
        length_cm: length,
        unit: "cm",
        display: `${width} × ${length} см`,
        source: "title",
        confidence: "high",
      },
    },
  }
}

const product = {
  title: "Кровать Гринвич",
  metadata: { dimensions: body },
  variants: [variant("v90", "GR-09-1", 90, 200), variant("v180", "GR-18-1", 180, 200)],
}

const axis = buyerVariantAxis(product)
assert.equal(axis?.label, "Размер спального места")
assert.deepEqual(
  axis?.choices.map((choice) => [choice.sku, choice.label]),
  [
    ["GR-09-1", "90 × 200 см"],
    ["GR-18-1", "180 × 200 см"],
  ]
)
assert.equal(resolveBuyerVariantId(axis, "missing"), "v90")
assert.equal(resolveBuyerVariantId(axis, "v180"), "v180")
assert.equal(
  variantChipTarget("greenwich-gr-09-1-bed-90", "v180", { motif: "ballet", variant: "old" }),
  "greenwich-gr-09-1-bed-90?motif=ballet&variant=v180"
)

const envelopeOnly = {
  variants: [
    { id: "a", sku: "OL-85-2", metadata: { dimensions: { width_mm: 576, depth_mm: 965, height_mm: 900 } } },
    { id: "b", sku: "OL-85-9", metadata: { dimensions: { width_mm: 600, depth_mm: 900, height_mm: 800 } } },
  ],
}
assert.equal(buyerVariantAxis(envelopeOnly), null)

const partial = {
  variants: [
    variant("v90", "GR-09-1", 90, 200),
    { id: "unknown", sku: "OL-85-2", metadata: { mattress_size: { status: "MATTRESS_SIZE_UNKNOWN" } } },
  ],
}
assert.equal(buyerVariantAxis(partial), null)

const fromOption = buyerVariantAxis({
  options: [{ id: "opt_size", title: "Размер" }],
  variants: [
    {
      id: "m1",
      sku: "MAT-90",
      variant_rank: 1,
      options: [{ option_id: "opt_size", value: "90 × 200 см" }],
    },
    {
      id: "m2",
      sku: "MAT-180",
      variant_rank: 0,
      options: [{ option_id: "opt_size", value: "180 × 200 см" }],
    },
  ],
})
assert.equal(fromOption?.label, "Размер")
assert.deepEqual(
  fromOption?.choices.map((choice) => choice.sku),
  ["MAT-180", "MAT-90"]
)

const ignoredDefault = buyerVariantAxis({
  options: [{ id: "opt_default", title: "Default" }],
  variants: [
    { id: "a", sku: "A-1", options: [{ option_id: "opt_default", value: "Default" }] },
    { id: "b", sku: "B-1", options: [{ option_id: "opt_default", value: "Default" }] },
  ],
})
assert.equal(ignoredDefault, null)

console.log("buyer-variant-axis.fidelity.test.ts ok")
