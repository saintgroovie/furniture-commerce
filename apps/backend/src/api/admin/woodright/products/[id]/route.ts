import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  loadSellerProductById,
  type QueryGraph,
} from "../../../../../lib/woodright-admin/seller-product"
import { resolveWoodrightSiteUrl } from "../../../../../lib/woodright-admin/site-preview-url"

/**
 * Single seller product for the Workspace editor.
 * GET /admin/woodright/products/:id
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id as string
  const query = req.scope.resolve("query") as QueryGraph
  const product = await loadSellerProductById(query, id)
  if (!product) {
    res.status(404).json({ code: "not_found", message: "Товар не найден" })
    return
  }
  res.json({
    product,
    site_url: resolveWoodrightSiteUrl(),
  })
}
