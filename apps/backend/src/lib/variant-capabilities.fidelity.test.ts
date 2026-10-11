/**
 * Run: npx --yes tsx src/lib/variant-capabilities.fidelity.test.ts
 * from apps/backend.
 */
import assert from "node:assert/strict"
import { isKnownFinishExecutionKey } from "./finish-color-premium-contract"
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

/* Country beds share a product. Each SKU keeps its own finish list.
   A neighbor color must not become a valid cart finish. */
const shared = {
  finish_color_executions: [
    { key: "cream", label: "Молочный" },
    { key: "torno", label: "Кремовый" },
    { key: "blue", label: "Голубой" },
    { key: "olive", label: "Оливковый" },
    { key: "grey", label: "Серый" },
  ],
}
const co14 = productMetadataForVariant(shared, {
  capabilities: {
    finish_color_executions: [
      { key: "cream", label: "Молочный" },
      { key: "torno", label: "Кремовый" },
    ],
  },
})
const co15 = productMetadataForVariant(shared, {
  capabilities: {
    finish_color_executions: [
      { key: "cream", label: "Молочный" },
      { key: "blue", label: "Голубой" },
      { key: "olive", label: "Оливковый" },
      { key: "grey", label: "Серый" },
    ],
  },
})
assert.equal(isKnownFinishExecutionKey(co14, "torno"), true)
assert.equal(isKnownFinishExecutionKey(co14, "blue"), false)
assert.equal(isKnownFinishExecutionKey(co15, "blue"), true)
assert.equal(isKnownFinishExecutionKey(co15, "torno"), false)

/* A SKU with no finish bag must not inherit the product or a sibling. */
const noFinish = productMetadataForVariant(shared, {
  capabilities: { material_tiers: [{ key: "ldsp", price_multiplier: 0.7 }] },
})
assert.equal(isKnownFinishExecutionKey(noFinish, "cream"), false)
assert.equal(isKnownFinishExecutionKey(noFinish, "torno"), false)
assert.equal(isKnownFinishExecutionKey(noFinish, "blue"), false)

console.log("variant-capabilities.fidelity.test.ts ok")
