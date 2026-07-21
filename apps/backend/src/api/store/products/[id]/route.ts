import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { projectDefaultBuyerConfigurationOntoProduct } from "../../../lib/default-buyer-configuration"

/**
 * Product detail by id. Variants must include flattened `prices` so PDP
 * `getPrice()` works without a separate pricing round-trip.
 *
 * Medusa graph `variants.*` does not nest `price_set`; request
 * `variants.price_set.prices.*` and mirror into `prices` (same contract as
 * `/store/products` list loader).
 *
 * Also projects `metadata.buyer_default_configuration` so PDP opening price
 * shares the same backend-resolved default as catalog browse cards.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id as string
  const query = req.scope.resolve("query") as {
    graph: (args: {
      entity: string
      fields: string[]
      filters?: Record<string, unknown>
    }) => Promise<{ data: unknown[] }>
  }
  const { data } = await query.graph({
    entity: "product",
    fields: [
      "*",
      "variants.*",
      "variants.price_set.prices.*",
      "images.*",
      "product_classification.*",
    ],
    filters: { id },
  })
  const product = Array.isArray(data) ? data[0] : undefined
  if (!product) {
    res.status(404).json({ message: "Product not found" })
    return
  }
  const raw = product as Record<string, unknown> & {
    variants?: Array<
      Record<string, unknown> & { price_set?: { prices?: unknown[] } }
    >
  }
  if (Array.isArray(raw.variants)) {
    raw.variants = raw.variants.map((variant) => {
      if (!variant.prices && variant.price_set?.prices) {
        return { ...variant, prices: variant.price_set.prices }
      }
      return variant
    })
  }
  res.json({ product: projectDefaultBuyerConfigurationOntoProduct(raw) })
}
