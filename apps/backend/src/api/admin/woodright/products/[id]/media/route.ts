import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { SqlClient } from "../../../../../../lib/woodright-workspace/first-price"
import { withMediaWriteLock } from "../../../../../../lib/woodright-workspace/media-lock"
import {
  decideDetach,
  decideHeroThumbnail,
  decideMove,
  type ProductImage,
} from "../../../../../../lib/woodright-admin/product-media-command"
import { loadSellerProductById, type QueryGraph } from "../../../../../../lib/woodright-admin/seller-product"
import { appendDeskAudit } from "../../../../../../lib/woodright-workspace/desk-audit"
import { requireDeskWrite } from "../../../../../../lib/woodright-workspace/require-desk-write"

type ProductWriter = {
  updateProducts: (
    id: string,
    data: { thumbnail?: string | null; images?: Array<{ id?: string; url: string }> }
  ) => Promise<unknown>
}

/**
 * Hero, reorder, and detach for images already on the product.
 * Detach does not delete the file. Nothing here publishes the product.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const gate = await requireDeskWrite(req, res, "catalog.media")
  if (!gate) return
  const id = req.params.id as string
  const body = (req.body ?? {}) as {
    thumbnail_url?: unknown
    action?: unknown
    url?: unknown
    direction?: unknown
    expected?: unknown
  }
  const action = body.action === "detach" || body.action === "reorder" ? body.action : "hero"
  const sql = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as SqlClient
  const locked = await withMediaWriteLock(sql, id, () => applyMediaChange(req, gate, id, action, body))
  if (!locked.ok) {
    res.status(500).json({ message: "Кадр не записан. Повторите" })
    return
  }
  const outcome = locked.value
  if (outcome.status !== 200) {
    res.status(outcome.status).json(outcome.body)
    return
  }
  res.json(outcome.body)
}

async function applyMediaChange(
  req: MedusaRequest,
  gate: { actorId: string; email: string | null },
  id: string,
  action: "hero" | "reorder" | "detach",
  body: {
    thumbnail_url?: unknown
    url?: unknown
    direction?: unknown
    expected?: unknown
  }
): Promise<{ status: number; body: Record<string, unknown> }> {
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
    return { status: 404, body: { message: "Товар не найден" } }
  }
  const images: ProductImage[] = (raw.images ?? [])
    .filter((image) => typeof image.id === "string" && typeof image.url === "string")
    .map((image) => ({ id: image.id as string, url: image.url as string }))
  const productModule = req.scope.resolve(Modules.PRODUCT) as ProductWriter
  const currentOrder = images.map((image) => image.url).join("\n")

  if (action === "detach" || action === "reorder") {
    if (typeof body.expected === "string" && body.expected !== currentOrder) {
      return {
        status: 409,
        body: { code: "stale_media", message: "Кадры уже изменились. Обновите страницу" },
      }
    }
    const url = typeof body.url === "string" ? body.url.trim() : ""
    if (!url) {
      return { status: 400, body: { message: "Выберите кадр товара" } }
    }
    if (action === "reorder") {
      const direction = body.direction === "up" || body.direction === "down" ? body.direction : null
      if (!direction) {
        return { status: 400, body: { message: "Укажите направление" } }
      }
      const moved = decideMove(images, url, direction)
      if (!moved.ok) {
        return { status: 400, body: { message: moved.message } }
      }
      await productModule.updateProducts(id, {
        thumbnail: raw.thumbnail ?? null,
        images: moved.images.map((image) => ({ id: image.id, url: image.url })),
      })
      const product = await loadSellerProductById(query, id)
      const audit = await appendDeskAudit(req, {
        actorId: gate.actorId,
        actorEmail: gate.email,
        entityType: "product",
        entityId: id,
        action: "media.reorder",
        before: { urls: images.map((image) => image.url) },
        after: { urls: product?.images?.map((image) => image.url) ?? moved.images.map((image) => image.url) },
      })
      return { status: 200, body: { product, audit } }
    }
    const detached = decideDetach(images, raw.thumbnail ?? null, url)
    if (!detached.ok) {
      return { status: 400, body: { message: detached.message } }
    }
    await productModule.updateProducts(id, {
      thumbnail: detached.thumbnail,
      images: detached.images.map((image) => ({ id: image.id, url: image.url })),
    })
    const product = await loadSellerProductById(query, id)
    const audit = await appendDeskAudit(req, {
      actorId: gate.actorId,
      actorEmail: gate.email,
      entityType: "product",
      entityId: id,
      action: "media.detach",
      before: { url, thumbnail: raw.thumbnail ?? null },
      after: { url, thumbnail: product?.thumbnail ?? detached.thumbnail, attached: false },
    })
    return { status: 200, body: { product, audit } }
  }

  if (typeof body.thumbnail_url !== "string" || !body.thumbnail_url.trim()) {
    return { status: 400, body: { message: "Выберите кадр, который уже есть у товара" } }
  }
  const decision = decideHeroThumbnail(images, raw.thumbnail ?? null, body.thumbnail_url.trim())
  if (!decision.ok) {
    return { status: 400, body: { message: decision.message } }
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
  return { status: 200, body: { product, audit } }
}
