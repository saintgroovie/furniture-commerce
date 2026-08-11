/**
 * Run: `npx tsx src/lib/default-buyer-configuration.fidelity.test.ts` from apps/backend
 */
import assert from "node:assert/strict"
import {
  projectDefaultBuyerConfigurationOntoProduct,
  resolveDefaultBuyerConfiguration,
} from "./default-buyer-configuration"

const tiersMeta = {
  material_tiers: {
    solid_front_ldsp_body: {
      key: "solid_front_ldsp_body",
      label_ru: "ЛДСП",
      price_multiplier: 0.7,
      position: 0,
    },
    solid_full: {
      key: "solid_full",
      label_ru: "Массив",
      price_multiplier: 1,
      position: 1,
    },
  },
}

{
  const product = {
    id: "p1",
    variants: [{ id: "v1", prices: [{ amount: 100_000 }] }],
    metadata: tiersMeta,
  }
  const d = resolveDefaultBuyerConfiguration(product)
  assert.ok(d)
  assert.equal(d!.min_unit_price, 70_000)
  assert.equal(d!.material_execution_code, "solid_front_ldsp_body")
  assert.equal(d!.variant_id, "v1")
  assert.equal(d!.color_multiplier, 1)
}

{
  const product = {
    id: "p2",
    variants: [
      { id: "v-unpriced", prices: [{ amount: 0 }] },
      { id: "v2", calculated_price: { calculated_amount: 54_355 } },
    ],
    metadata: {},
  }
  /* Opening variant is variants[0]; unpriced → no default (align with getPrice). */
  assert.equal(resolveDefaultBuyerConfiguration(product), null)
}

{
  const product = {
    id: "p2b",
    variants: [{ id: "v2", calculated_price: { calculated_amount: 54_355 } }],
    metadata: {},
  }
  const d = resolveDefaultBuyerConfiguration(product)
  assert.ok(d)
  assert.equal(d!.min_unit_price, 54_355)
  assert.equal(d!.material_execution_code, null)
  assert.equal(d!.variant_id, "v2")
}

{
  const product = {
    id: "p3",
    variants: [{ id: "v3", prices: [{ amount: 0 }] }],
    metadata: tiersMeta,
  }
  assert.equal(resolveDefaultBuyerConfiguration(product), null)
}

{
  const projected = projectDefaultBuyerConfigurationOntoProduct({
    id: "p4",
    variants: [{ id: "v4", prices: [{ amount: 77650 }] }],
    metadata: { ...tiersMeta, category_handle: "beds" },
  })
  const cfg = (projected.metadata as { buyer_default_configuration: { min_unit_price: number } })
    .buyer_default_configuration
  assert.equal(cfg.min_unit_price, Math.round(77650 * 0.7))
  assert.equal(
    (projected.metadata as { category_handle: string }).category_handle,
    "beds"
  )
}

console.log("default-buyer-configuration.fidelity.test.ts: ok")
