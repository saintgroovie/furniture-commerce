import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { decideHeroThumbnail } from "../../../../../../lib/woodright-admin/product-media-command"
import { loadSellerProductById, type QueryGraph } from "../../../../../../lib/woodright-admin/seller-product"
import { appendDeskAudit } from "../../../../../../lib/woodright-workspace/desk-audit"
import { requireDeskWrite } from "../../../../../../lib/woodright-workspace/require-desk-write"

/**
 * Hero assignment from images already on the product.
 * Does not upload, delete a file, or publish.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const gate = await requireDeskWrite(req, res, "catalog.media")
  if (!gate) return
  const id = req.params.id as string
  const body = (req.body ?? {}) as { thumbnail_url?: unknown }
  if (typeof body.thumbnail_url !== "string" || !body.thumbnail_url.trim()) {
    res.status(400).json({ message: "Выберите кадр, который уже есть у товара" })
    return
  }
  const query = req.scope.resolve("query") as QueryGraph
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "thumbnail", "status", "images.id", "images.url"],
    filters: { id },
  })
  const raw = data?.[0] as
    | { thumbnail?: string | null; status?: string; images?: Array<{ id?: string; url?: string }> }
    | undefined
  if (!raw) {
    res.status(404).json({ message: "Товар не найден" })
    return
  }
  const images = (raw.images ?? [])
    .filter((image) => typeof image.id === "string" && typeof image.url === "string")
    .map((image) => ({ id: image.id as string, url: image.url as string }))
  const decision = decideHeroThumbnail(images, raw.thumbnail ?? null, body.thumbnail_url.trim())
  if (!decision.ok) {
    res.status(400).json({ message: decision.message })
    return
  }
  const productModule = req.scope.resolve(Modules.PRODUCT) as {
    updateProducts: (id: string, data: { thumbnail: string }) => Promise<unknown>
  }
  await productModule.updateProducts(id, { thumbnail: decision.thumbnail })
  const product = await loadSellerProductById(query, id)
  const audit = await appendDeskAudit(req, {
    actorId: gate.actorId,
    actorEmail: gate.email,
    entityType: "product",
    entityId: id,
    action: "media.hero",
    before: { thumbnail: decision.previous, status: raw.status ?? null },
    after: { thumbnail: product?.thumbnail ?? decision.thumbnail, status: product?.status ?? raw.status ?? null },
  })
  res.json({ product, audit })
}
