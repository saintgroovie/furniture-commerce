/**
 * Browse opens a multi-SKU product on the same SKU as the full product graph
 * (lowest axis sort, then SKU), and keeps variant metadata out of the payload.
 *
 *   node_modules/.bin/tsx src/api/store/products/load-store-product-list-browse-opening.fidelity.test.ts
 */
import assert from "node:assert/strict"
import type { MedusaRequest } from "@medusajs/framework/http"
import { loadStoreProductList } from "./load-store-product-list"

const variants = [
  {
    id: "var_l",
    sku: "WR-L",
    metadata: { variant_axes: { size: { value: "L", sort: 1 } } },
    price: 1500,
  },
  {
    id: "var_s",
    sku: "WR-S",
    metadata: { variant_axes: { size: { value: "S", sort: 0 } } },
    price: 1000,
  },
]

const query = {
  async graph(args: {
    entity: string
    fields: string[]
    filters?: Record<string, unknown>
  }): Promise<{ data: unknown[] }> {
    if (args.entity === "region") return { data: [] }
    if (args.entity === "product_variant") {
      const ids = (args.filters?.id as string[]) ?? []
      return {
        data: variants
          .filter((v) => ids.includes(v.id))
          .map((v) => ({ id: v.id, price_set: { prices: [{ amount: v.price }] } })),
      }
    }
    if (args.entity === "product") {
      if (args.fields.length === 1 && args.fields[0] === "id") {
        return { data: [{ id: "prod_1" }] }
      }
      const withMetadata = args.fields.includes("variants.metadata")
      return {
        data: [
          {
            id: "prod_1",
            handle: "wr-product",
            title: "Product",
            status: "published",
            metadata: {},
            images: [],
            variants: variants.map((v) => ({
              id: v.id,
              sku: v.sku,
              ...(withMetadata ? { metadata: v.metadata } : {}),
            })),
          },
        ],
      }
    }
    return { data: [] }
  },
}

const req = {
  scope: { resolve: () => query },
  query: {},
} as unknown as MedusaRequest

async function main() {
  const [product] = await loadStoreProductList(req, { mode: "browse" })
  assert.ok(product)
  const configuration = (product.metadata as Record<string, unknown>)
    .buyer_default_configuration as { variant_id: string; min_unit_price: number }
  assert.equal(configuration.variant_id, "var_s")
  assert.equal(configuration.min_unit_price, 1000)

  for (const variant of product.variants as Array<Record<string, unknown>>) {
    assert.equal("metadata" in variant, false, "browse payload stays lean")
  }

  console.log("load-store-product-list-browse-opening.fidelity.test.ts: ok")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
