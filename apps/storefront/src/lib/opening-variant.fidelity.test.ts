/**
 * Opening SKU ignores array order.
 * Run: node ../backend/node_modules/tsx/dist/cli.mjs src/lib/opening-variant.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { getPrice } from "./format"
import { openingVariant } from "./opening-variant"

const ol15 = {
  id: "variant_ol_15_2",
  sku: "OL-15-2",
  calculated_price: { calculated_amount: 98_900, currency_code: "rub" },
}
const ol14 = {
  id: "variant_ol_14_2",
  sku: "OL-14-2",
  calculated_price: { calculated_amount: 69_900, currency_code: "rub" },
}
const product = {
  id: "prod_oliver",
  handle: "ol-14-1",
  title: "Кровать Оливер",
  variants: [ol15, ol14],
  metadata: {
    buyer_default_configuration: {
      variant_id: ol14.id,
      min_unit_price: 48_930,
      material_price_multiplier: 0.7,
    },
  },
  product_classification: { product_type: "CONFIGURABLE" },
}

assert.equal(openingVariant(product)?.sku, "OL-14-2")
assert.equal(getPrice(product), 69_900)
assert.equal(
  product.metadata.buyer_default_configuration.min_unit_price,
  48_930
)
assert.equal(
  openingVariant({ id: "bare", variants: [ol15, ol14] }),
  null,
  "two SKUs without an opening contract do not fall back to variants[0]"
)

console.log("opening-variant.fidelity.test.ts: ok")
