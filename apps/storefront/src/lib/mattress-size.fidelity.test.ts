/**
 * Sleeping size stays structured and never comes from the body envelope.
 * Run from apps/storefront:
 *   npx --yes tsx src/lib/mattress-size.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { getDimensions, getMattressSize } from "./product-metadata"

const body = { depth_mm: 965, width_mm: 576, height_mm: 900 }

const confirmed = getMattressSize({
  metadata: {
    dimensions: body,
    mattress_size: {
      key: "90x200",
      width_cm: 90,
      length_cm: 200,
      unit: "cm",
      display: "90 × 200 см",
      source: "title",
      confidence: "high",
    },
  },
})
assert.equal(confirmed?.key, "90x200")
assert.equal(confirmed?.display, "90 × 200 см")

const fromVariant = getMattressSize(
  {
    metadata: {
      mattress_size: {
        key: "180x200",
        width_cm: 180,
        length_cm: 200,
        display: "180 × 200 см",
      },
    },
  },
  {
    metadata: {
      mattress_size: {
        key: "90x200",
        width_cm: 90,
        length_cm: 200,
        display: "90 × 200 см",
      },
    },
  }
)
assert.equal(fromVariant?.key, "90x200")

const unknown = getMattressSize({
  metadata: {
    dimensions: body,
    mattress_size: {
      status: "MATTRESS_SIZE_UNKNOWN",
      key: null,
      width_cm: null,
      length_cm: null,
      display: null,
    },
  },
})
assert.equal(unknown, null)
assert.deepEqual(getDimensions({ metadata: { dimensions: body } })?.width_mm, 576)

const variantUnknown = getMattressSize(
  {
    metadata: {
      mattress_size: {
        key: "90x200",
        width_cm: 90,
        length_cm: 200,
        display: "90 × 200 см",
      },
    },
  },
  {
    metadata: {
      mattress_size: {
        status: "MATTRESS_SIZE_UNKNOWN",
        width_cm: null,
        length_cm: null,
      },
    },
  }
)
assert.equal(variantUnknown, null)

const variantMismatch = getMattressSize(
  {
    metadata: {
      mattress_size: {
        key: "90x200",
        width_cm: 90,
        length_cm: 200,
        display: "90 × 200 см",
      },
    },
  },
  {
    metadata: {
      mattress_size: {
        key: "90x190",
        width_cm: 90,
        length_cm: 200,
        display: "90 × 200 см",
      },
    },
  }
)
assert.equal(variantMismatch, null)

const variantWithoutBag = getMattressSize(
  {
    metadata: {
      mattress_size: {
        key: "90x200",
        width_cm: 90,
        length_cm: 200,
        display: "90 × 200 см",
      },
    },
  },
  { metadata: {} }
)
assert.equal(variantWithoutBag?.key, "90x200")

const mismatched = getMattressSize({
  metadata: {
    mattress_size: {
      key: "90x190",
      width_cm: 90,
      length_cm: 200,
      display: "90 × 200 см",
    },
  },
})
assert.equal(mismatched, null)

console.log("mattress-size.fidelity.test.ts: ok")
