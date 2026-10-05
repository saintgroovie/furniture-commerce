import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PRODUCT_COMPATIBILITY_MODULE } from "../../../../../modules/product-compatibility"
import { resolveCompatibilityView } from "../../../../../modules/product-compatibility/resolve-compatibility"

/**
 * Buyer view of one compatibility table.
 * Draft products are not returned. The response is links only, not a cart bundle.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const productId = req.params.id as string
  const service = req.scope.resolve(PRODUCT_COMPATIBILITY_MODULE) as {
    listProductCompatibilities: (
      filters: Record<string, unknown>,
      config?: { take?: number }
    ) => Promise<Array<{ accessory_product_id: string; product_id: string }>>
  }
  const [asHost, asAccessory] = await Promise.all([
    service.listProductCompatibilities({ product_id: productId }, { take: 50 }),
    service.listProductCompatibilities(
      { accessory_product_id: productId },
      { take: 50 }
    ),
  ])
  const links = [...asHost, ...asAccessory]
  const ids = new Set<string>()
  for (const link of links) {
    ids.add(link.accessory_product_id)
    ids.add(link.product_id)
  }
  ids.add(productId)

  const query = req.scope.resolve("query") as {
    graph: (args: {
      entity: string
      fields: string[]
      filters?: Record<string, unknown>
    }) => Promise<{ data: unknown[] }>
  }
  const { data } = ids.size
    ? await query.graph({
        entity: "product",
        fields: ["id", "title", "handle", "status"],
        filters: { id: [...ids] },
      })
    : { data: [] }
  const products = (Array.isArray(data) ? data : []) as Array<{
    id: string
    title: string
    handle: string
    status: string
  }>
  const view = resolveCompatibilityView({ productId, links, products })
  res.json(view)
}
