import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { PRODUCT_EXTENSION_MODULE } from "../../../../../../modules/product-extension"
import { loadSellerProductById, type QueryGraph } from "../../../../../../lib/woodright-admin/seller-product"
import { appendDeskAudit } from "../../../../../../lib/woodright-workspace/desk-audit"
import { requireDeskWrite } from "../../../../../../lib/woodright-workspace/require-desk-write"

const TYPES = ["STANDARD", "CONFIGURABLE", "BESPOKE"] as const
type Classification = (typeof TYPES)[number]

/**
 * Explicit classification change. Does not publish, reprice, or create variants.
 * BESPOKE stays off the cart. SKU and handle stay untouched.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const gate = await requireDeskWrite(req, res, "catalog.edit")
  if (!gate) return
  const id = req.params.id as string
  const body = (req.body ?? {}) as { classification?: unknown; confirm?: unknown }
  const next = body.classification
  if (next !== "STANDARD" && next !== "CONFIGURABLE" && next !== "BESPOKE") {
    res.status(400).json({ message: "Выберите тип товара" })
    return
  }
  if (body.confirm !== true) {
    res.status(409).json({
      code: "needs_confirm",
      message: "Подтвердите смену типа. Для проекта корзина закроется",
    })
    return
  }
  const query = req.scope.resolve("query") as QueryGraph
  const before = await loadSellerProductById(query, id)
  if (!before) {
    res.status(404).json({ message: "Товар не найден" })
    return
  }
  const previous = before.classification
  if (previous !== "STANDARD" && previous !== "CONFIGURABLE" && previous !== "BESPOKE") {
    res.status(404).json({ message: "Тип товара не найден" })
    return
  }
  const sql = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as {
    raw: (query: string, bindings?: unknown[]) => Promise<{ rows?: Array<Record<string, unknown>> }>
  }
  const linked = await sql.raw(
    `select product_classification_id as id
       from product_productextensionmodule_product_classificat7e368fb4
      where product_id = ?
        and deleted_at is null
      limit 1`,
    [id]
  )
  const classId = linked.rows?.[0]?.id
  if (typeof classId !== "string" || !classId) {
    res.status(404).json({ message: "Тип товара не найден" })
    return
  }
  if (previous !== next) {
    const extension = req.scope.resolve(PRODUCT_EXTENSION_MODULE) as {
      updateProductClassifications: (data: { id: string; product_type: Classification }) => Promise<unknown>
    }
    await extension.updateProductClassifications({ id: classId, product_type: next })
  }
  const product = await loadSellerProductById(query, id)
  const audit = await appendDeskAudit(req, {
    actorId: gate.actorId,
    actorEmail: gate.email,
    entityType: "product",
    entityId: id,
    action: "classification.update",
    before: { classification: previous, status: before.status },
    after: { classification: product?.classification ?? next, status: product?.status ?? before.status },
  })
  res.json({ product, audit })
}
