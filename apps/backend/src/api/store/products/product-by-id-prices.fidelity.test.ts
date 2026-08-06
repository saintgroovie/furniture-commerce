/**
 * Store product-by-id must flatten variant prices (PDP getPrice contract).
 *
 *   node --import tsx --test src/api/store/products/product-by-id-prices.fidelity.test.ts
 *   or: ../backend/node_modules/.bin/tsx -e '...'
 *
 * Static contract check — mirrors list-loader flatten without booting Medusa.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const routeSrc = readFileSync(
  join(process.cwd(), "src/api/store/products/[id]/route.ts"),
  "utf8"
)

assert.match(
  routeSrc,
  /variants\.price_set\.prices\.\*/,
  "retrieve must request nested price_set prices"
)
assert.match(
  routeSrc,
  /prices:\s*variant\.price_set\.prices/,
  "retrieve must flatten price_set into variant.prices"
)

function flattenVariantPrices(
  product: Record<string, unknown>
): Record<string, unknown> {
  const variants = product.variants as
    | Array<Record<string, unknown> & { price_set?: { prices?: unknown[] } }>
    | undefined
  if (!Array.isArray(variants)) return product
  return {
    ...product,
    variants: variants.map((variant) =>
      !variant.prices && variant.price_set?.prices
        ? { ...variant, prices: variant.price_set.prices }
        : variant
    ),
  }
}

const raw = {
  id: "prod_x",
  variants: [
    {
      id: "var_x",
      price_set: { prices: [{ amount: 94000, currency_code: "rub" }] },
    },
  ],
}
const flat = flattenVariantPrices(raw) as {
  variants: Array<{ prices?: Array<{ amount: number }> }>
}
assert.equal(flat.variants[0]!.prices![0]!.amount, 94000)

console.log("product-by-id-prices.fidelity.test.ts: ok")
