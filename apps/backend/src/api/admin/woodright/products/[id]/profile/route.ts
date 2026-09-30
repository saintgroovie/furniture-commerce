import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { loadSellerProductById, type QueryGraph } from "../../../../../../lib/woodright-admin/seller-product"
import { requireDeskWrite } from "../../../../../../lib/woodright-workspace/require-desk-write"

const ALLOWED = new Set(["title", "subtitle", "description"])

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const gate = await requireDeskWrite(req, res, "catalog.edit")
  if (!gate) return
  const id = req.params.id as string
  const body = (req.body ?? {}) as Record<string, unknown>
  const extra = Object.keys(body).filter((key) => !ALLOWED.has(key))
  if (extra.length) {
    res.status(400).json({ message: "Артикул и адрес страницы здесь не меняются" })
    return
  }
  const data: { title?: string; subtitle?: string; description?: string } = {}
  if ("title" in body) {
    const title = typeof body.title === "string" ? body.title.trim() : ""
    if (title.length < 2) {
      res.status(400).json({ message: "Название слишком короткое" })
      return
    }
    data.title = title
  }
  if ("subtitle" in body) data.subtitle = typeof body.subtitle === "string" ? body.subtitle.trim() : ""
  if ("description" in body) data.description = typeof body.description === "string" ? body.description.trim() : ""
  if (!Object.keys(data).length) {
    res.status(400).json({ message: "Нет полей для сохранения" })
    return
  }
  const productModule = req.scope.resolve(Modules.PRODUCT) as {
    updateProducts: (id: string, data: object) => Promise<unknown>
  }
  await productModule.updateProducts(id, data)
  const query = req.scope.resolve("query") as QueryGraph
  const product = await loadSellerProductById(query, id)
  if (!product) {
    res.status(404).json({ message: "Товар не найден" })
    return
  }
  res.json({ product })
}
