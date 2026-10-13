/**
 * Fidelity: PDP variant price never falls back to another SKU.
 * Run: yarn dlx tsx src/lib/format-price.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { getPrice, pdpVariantPrice, priceOfVariant } from "./format"

const first = { id: "v1", prices: [{ amount: 1000, price_list_id: null }] }
const second = { id: "v2", prices: [{ amount: 1500, price_list_id: null }] }
const unpriced = { id: "v3", prices: [] }
const promoOnly = { id: "v4", prices: [{ amount: 900, price_list_id: "plist_1" }] }
const product = {
  id: "p",
  variants: [second, first, unpriced, promoOnly],
  metadata: {
    buyer_default_configuration: { variant_id: "v1", min_unit_price: 1000 },
  },
}

assert.equal(pdpVariantPrice(product, null), 1000, "no selection: named opening SKU, not array head")
assert.equal(
  pdpVariantPrice({ id: "unordered", variants: [second, first] }, null),
  null,
  "multi-SKU product without an opening contract does not use variants[0]"
)
assert.equal(pdpVariantPrice(product, undefined), getPrice(product))
assert.equal(pdpVariantPrice(product, second), 1500, "selected variant: its own base")
assert.equal(pdpVariantPrice(product, unpriced), null, "unpriced selection does not inherit the first SKU")
assert.equal(pdpVariantPrice(product, { id: "v5" }), null, "variant without prices stays unpriced")
assert.equal(pdpVariantPrice(product, promoOnly), priceOfVariant(promoOnly))
{
  const onSale = {
    id: "v6",
    prices: [
      { amount: 1500, price_list_id: null },
      { amount: 900, price_list_id: "plist_1" },
    ],
    calculated_price: { calculated_amount: 1200, original_amount: 1500 },
  }
  assert.equal(priceOfVariant(onSale), 1200, "active calculated price wins over the undiscounted base row")
}
assert.equal(pdpVariantPrice({ id: "empty", variants: [] }, null), null)

{
  const page = readFileSync(join(process.cwd(), "src", "app", "product", "[id]", "page.tsx"), "utf8")
  assert.ok(page.includes("pdpVariantPrice(product, selectedVariant)"), "PDP uses the no-fallback helper")
  assert.equal(/priceOfVariant\(selectedVariant\)\s*\?\?/.test(page), false, "no neighbour-price fallback on the PDP")
}

console.log("format-price fidelity: ok")
