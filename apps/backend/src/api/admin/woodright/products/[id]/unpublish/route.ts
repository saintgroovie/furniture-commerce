import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { loadSellerProductById, type QueryGraph } from "../../../../../../lib/woodright-admin/seller-product"
import { appendDeskAudit } from "../../../../../../lib/woodright-workspace/desk-audit"
import { requireDeskWrite } from "../../../../../../lib/woodright-workspace/require-desk-write"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const gate = await requireDeskWrite(req, res, "catalog.publish")
  if (!gate) return
  const id = req.params.id as string
  const productModule = req.scope.resolve(Modules.PRODUCT) as {
    updateProducts: (id: string, data: { status: "draft" }) => Promise<unknown>
  }
  const query = req.scope.resolve("query") as QueryGraph
  const before = await loadSellerProductById(query, id)
  if (!before) {
    res.status(404).json({ message: "Товар не найден" })
    return
  }
  await productModule.updateProducts(id, { status: "draft" })
  const product = await loadSellerProductById(query, id)
  const audit = await appendDeskAudit(req, {
    actorId: gate.actorId,
    actorEmail: gate.email,
    entityType: "product",
    entityId: id,
    action: "unpublish",
    before: { status: before.status },
    after: { status: product?.status ?? "draft" },
  })
  res.json({
    product,
    message: "Товар перестанет отображаться покупателю",
    audit,
  })
}
