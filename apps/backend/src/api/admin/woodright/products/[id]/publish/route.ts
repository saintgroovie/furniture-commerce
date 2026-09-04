import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import {
  computeWorkspacePublishReadiness,
  decideWorkspacePublish,
} from "../../../../../../lib/woodright-admin/publish-readiness"
import {
  loadSellerProductById,
  SELLER_PRODUCT_GRAPH_FIELDS,
  type QueryGraph,
} from "../../../../../../lib/woodright-admin/seller-product"

type ProductModule = {
  updateProducts: (id: string, data: { status: "published" | "draft" }) => Promise<unknown>
}

/**
 * Seller-safe publish. Blockers are computed server-side.
 * POST /admin/woodright/products/:id/publish
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id as string
  const query = req.scope.resolve("query") as QueryGraph
  const { data } = await query.graph({
    entity: "product",
    fields: SELLER_PRODUCT_GRAPH_FIELDS,
    filters: { id },
  })
  const raw = data?.[0] as Record<string, unknown> | undefined
  if (!raw) {
    res.status(404).json({ code: "not_found", message: "Товар не найден" })
    return
  }

  const readiness = computeWorkspacePublishReadiness(raw)
  const decision = decideWorkspacePublish(String(raw.status ?? "draft"), readiness)
  if (!decision.ok) {
    res.status(409).json({
      code: decision.code,
      message: decision.message,
      blockers: decision.blockers,
      warnings: readiness.warnings,
    })
    return
  }

  const productModule = req.scope.resolve(Modules.PRODUCT) as ProductModule
  await productModule.updateProducts(id, { status: "published" })
  const product = await loadSellerProductById(query, id)
  res.json({
    product,
    publish: product?.publish ?? readiness,
  })
}
