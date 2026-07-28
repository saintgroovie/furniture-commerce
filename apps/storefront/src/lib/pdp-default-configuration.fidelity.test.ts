/**
 * PDP / card / cart opening-price parity for CONFIGURABLE products.
 * Run: `npx tsx src/lib/pdp-default-configuration.fidelity.test.ts` from apps/storefront
 */
import assert from "node:assert/strict"
import { resolveCatalogCardPrice } from "./catalog-card-price"
import { buildMaterialTierOptions } from "./material-tiers"
import {
  resolveConfiguredUnitPrice,
  resolveFinishColorMultiplier,
} from "./finish-color-premium"
import { cartLineConfigurationIdentity } from "./cart-line-identity"

const tiersMeta = {
  material_tiers: {
    solid_front_ldsp_body: {
      key: "solid_front_ldsp_body",
      label_ru: "Фасады из массива + корпус ЛДСП",
      price_multiplier: 0.7,
      position: 0,
    },
    solid_full: {
      key: "solid_full",
      label_ru: "Полностью из массива",
      price_multiplier: 1,
      position: 1,
    },
  },
}

function configurable(base = 77650): Record<string, unknown> {
  return {
    id: "prod_cfg",
    handle: "cfg-demo",
    product_classification: { product_type: "CONFIGURABLE" },
    variants: [{ id: "var_1", calculated_price: { calculated_amount: base } }],
    metadata: { ...tiersMeta },
  }
}

// 1–3: default config is cheapest purchasable tier (LDSP)
{
  const product = configurable()
  const tiers = buildMaterialTierOptions(product)
  assert.ok(tiers)
  assert.equal(tiers![0]!.code, "solid_front_ldsp_body")
  assert.equal(tiers![0]!.price, Math.round(77650 * 0.7))
  const card = resolveCatalogCardPrice(product)
  assert.equal(card.amount, tiers![0]!.price)
  assert.equal(card.prefix, "от ")
}

// Backend-projected buyer_default_configuration wins over local tier math
{
  const product = configurable(100_000)
  ;(product.metadata as Record<string, unknown>).buyer_default_configuration = {
    min_unit_price: 70_000,
    material_execution_code: "solid_front_ldsp_body",
    material_price_multiplier: 0.7,
    variant_id: "var_1",
    color_multiplier: 1,
  }
  assert.equal(resolveCatalogCardPrice(product).amount, 70_000)
}

// 4–7: PDP opening price = card min = configured unit (LDSP × standard color)
{
  const base = 77650
  const product = configurable(base)
  const tiers = buildMaterialTierOptions(product)!
  const defaultTier = tiers[0]!
  const colorMult = resolveFinishColorMultiplier(null, "milk")
  const pdpAmount = resolveConfiguredUnitPrice(
    base,
    defaultTier.multiplier,
    colorMult
  )
  assert.equal(pdpAmount, resolveCatalogCardPrice(product).amount)
  assert.equal(colorMult, 1)
}

// 9–10: cart identity separates LDSP vs full solid on same variant_id
{
  const a = cartLineConfigurationIdentity({
    variant_id: "var_1",
    product_id: "prod_cfg",
    metadata: { material_execution_code: "solid_front_ldsp_body" },
  })
  const b = cartLineConfigurationIdentity({
    variant_id: "var_1",
    product_id: "prod_cfg",
    metadata: { material_execution_code: "solid_full" },
  })
  assert.notEqual(a, b)
}

// 18–19: unpriced / zero base does not invent a positive card min
{
  const product = configurable(0)
  product.variants = [{ id: "var_0", calculated_price: { calculated_amount: 0 } }]
  assert.equal(resolveCatalogCardPrice(product).amount, null)
}

// 20: STANDARD has no «от» gate
{
  const product = {
    id: "std",
    product_classification: { product_type: "STANDARD" },
    variants: [{ calculated_price: { calculated_amount: 12_000 } }],
    metadata: {},
  }
  const card = resolveCatalogCardPrice(product)
  assert.equal(card.prefix, "")
  assert.equal(card.amount, 12_000)
}

console.log("pdp-default-configuration.fidelity.test.ts: ok")
