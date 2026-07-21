/**
 * Run: `yarn tsx src/lib/catalog-card-price.fidelity.test.ts` from apps/storefront
 */
import assert from "node:assert/strict"
import { resolveCatalogCardPrice } from "./catalog-card-price"

function product(
  extras: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: "p-1",
    title: "Test",
    product_classification: { product_type: "CONFIGURABLE" },
    variants: [{ calculated_price: { calculated_amount: 100_000 } }],
    metadata: {},
    ...extras,
  }
}

// Material tiers → min tier price with «от»
{
  const p = product({
    metadata: {
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
    },
  })
  const resolved = resolveCatalogCardPrice(p)
  assert.equal(resolved.prefix, "от ")
  assert.equal(resolved.amount, 70_000)
  assert.equal(resolved.requestQuoteLabel, null)
}

// Backend buyer_default_configuration is preferred SoT
{
  const p = product({
    metadata: {
      buyer_default_configuration: {
        min_unit_price: 54_355,
        material_execution_code: "solid_front_ldsp_body",
      },
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
    },
  })
  assert.equal(resolveCatalogCardPrice(p).amount, 54_355)
}

// STANDARD single variant, no tiers → exact price
{
  const p = product({
    product_classification: { product_type: "STANDARD" },
  })
  const resolved = resolveCatalogCardPrice(p)
  assert.equal(resolved.prefix, "")
  assert.equal(resolved.amount, 100_000)
}

// Never surface fake zero
{
  const p = product({
    variants: [{ calculated_price: { calculated_amount: 0 } }],
    product_classification: { product_type: "STANDARD" },
  })
  const resolved = resolveCatalogCardPrice(p)
  assert.equal(resolved.amount, null)
  assert.equal(resolved.prefix, "")
}

// Display group min price keeps «от»
{
  const p = product()
  const resolved = resolveCatalogCardPrice(p, { count: 2, minPrice: 80_000 })
  assert.equal(resolved.prefix, "от ")
  assert.equal(resolved.amount, 80_000)
}

console.log("catalog-card-price.fidelity.test.ts: ok")
