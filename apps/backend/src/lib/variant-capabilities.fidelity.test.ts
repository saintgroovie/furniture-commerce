/**
 * Run: npx --yes tsx src/lib/variant-capabilities.fidelity.test.ts
 * from apps/backend.
 */
import assert from "node:assert/strict"
import { productMetadataForVariant } from "./variant-capabilities"

const product = {
  finish_color_executions: { oak: { name: "oak" } },
  paint_finish_executions: { white: {} },
  material_tiers: { ldsp: { price_multiplier: 1 } },
}

const overlaid = productMetadataForVariant(product, {
  capabilities: {
    finish_color_executions: { ash: { name: "ash" } },
    material_tiers: { massiv: { price_multiplier: 1.2 } },
  },
})
assert.deepEqual(overlaid.finish_color_executions, { ash: { name: "ash" } })
assert.equal("paint_finish_executions" in overlaid, false)
assert.deepEqual(overlaid.material_tiers, { massiv: { price_multiplier: 1.2 } })

const unchanged = productMetadataForVariant(product, { mattress_size: { display: "90 × 190 см" } })
assert.deepEqual(unchanged.finish_color_executions, { oak: { name: "oak" } })

console.log("variant-capabilities.fidelity.test.ts ok")
