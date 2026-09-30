import type { MedusaRequest } from "@medusajs/framework/http"
import {
  SELLER_PRODUCT_GRAPH_FIELDS,
  toSellerProductList,
  type QueryGraph,
} from "../woodright-admin/seller-product"

export function queryOf(req: MedusaRequest): QueryGraph {
  return req.scope.resolve("query") as QueryGraph
}

export async function loadSellerProducts(query: QueryGraph) {
  const products: Record<string, unknown>[] = []
  const take = 100
  for (let skip = 0; ; skip += take) {
    const { data } = await query.graph({
      entity: "product",
      fields: SELLER_PRODUCT_GRAPH_FIELDS,
      pagination: { take, skip },
    })
    const page = (data ?? []) as Record<string, unknown>[]
    products.push(...page)
    if (page.length < take) break
    if (skip > 5000) break
  }
  return toSellerProductList(products).products
}
