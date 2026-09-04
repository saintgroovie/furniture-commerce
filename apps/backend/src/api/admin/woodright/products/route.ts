import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createWoodrightDraftPorts } from "../../../../lib/woodright-admin/create-product-runtime"
import { createWoodrightDraftProduct } from "../../../../lib/woodright-admin/create-product-command"
import {
  loadSellerProductById,
  SELLER_PRODUCT_GRAPH_FIELDS,
  toSellerProductList,
  type QueryGraph,
} from "../../../../lib/woodright-admin/seller-product"
import { resolveWoodrightSiteUrl } from "../../../../lib/woodright-admin/site-preview-url"

async function loadAllProducts(query: QueryGraph): Promise<Record<string, unknown>[]> {
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
  }
  return products
}

/**
 * Seller list for Woodright Workspace.
 * GET /admin/woodright/products
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve("query") as QueryGraph
  const raw = await loadAllProducts(query)
  const { products, attention, publish_gate_audit } = toSellerProductList(raw)
  products.sort((a, b) => {
    const aTime = a.updated_at ?? ""
    const bTime = b.updated_at ?? ""
    return bTime.localeCompare(aTime)
  })
  res.json({
    products,
    attention,
    site_url: resolveWoodrightSiteUrl(),
    publish_gate_audit,
  })
}

/**
 * Create a Woodright draft product.
 * POST /admin/woodright/products
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const result = await createWoodrightDraftProduct(req.body, createWoodrightDraftPorts(req.scope))
  if (!result.ok) {
    const status = result.code === "duplicate_sku" ? 409 : 400
    res.status(status).json({
      code: result.code,
      message: result.message,
      field: result.field,
    })
    return
  }
  const query = req.scope.resolve("query") as QueryGraph
  const product = (await loadSellerProductById(query, result.product.id)) ?? result.product
  res.status(201).json({ product })
}
