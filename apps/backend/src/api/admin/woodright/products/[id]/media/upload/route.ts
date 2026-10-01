import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { loadSellerProductById, type QueryGraph } from "../../../../../../../lib/woodright-admin/seller-product"
import { appendDeskAudit } from "../../../../../../../lib/woodright-workspace/desk-audit"
import { validateUpload } from "../../../../../../../lib/woodright-workspace/media-bytes"
import type { SqlClient } from "../../../../../../../lib/woodright-workspace/first-price"
import { withMediaWriteLock } from "../../../../../../../lib/woodright-workspace/media-lock"
import { requireDeskWrite } from "../../../../../../../lib/woodright-workspace/require-desk-write"

/**
 * Server-side upload through the Medusa file module already configured
 * for this process. The browser does not receive a provider secret.
 * The new file is attached as an extra frame. It is not the hero, and
 * the product is not published.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const gate = await requireDeskWrite(req, res, "catalog.media")
  if (!gate) return
  const id = req.params.id as string
  const body = (req.body ?? {}) as { content_base64?: unknown }
  if (typeof body.content_base64 !== "string" || !body.content_base64) {
    res.status(400).json({ message: "Выберите файл" })
    return
  }
  let buf: Buffer
  try {
    buf = Buffer.from(body.content_base64, "base64")
  } catch {
    res.status(400).json({ message: "Файл не читается" })
    return
  }
  const checked = await validateUpload(buf)
  if (!checked.ok) {
    res.status(400).json({ message: checked.message })
    return
  }
  const query = req.scope.resolve("query") as QueryGraph
  const fileModule = req.scope.resolve(Modules.FILE) as {
    createFiles: (input: {
      filename: string
      mimeType: string
      content: string
      access: "public"
    }) => Promise<{ url?: string } | Array<{ url?: string }>>
  }
  const created = await fileModule.createFiles({
    filename: `frame.${checked.ext}`,
    mimeType: checked.mime,
    content: buf.toString("base64"),
    access: "public",
  })
  const file = Array.isArray(created) ? created[0] : created
  const url = file?.url
  if (!url) {
    res.status(500).json({ message: "Хранилище не вернуло адрес кадра" })
    return
  }
  const sql = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as SqlClient
  const locked = await withMediaWriteLock(sql, id, async () => {
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "thumbnail", "status", "images.id", "images.url"],
      filters: { id },
    })
    const raw = data?.[0] as
      | { thumbnail?: string | null; status?: string; images?: Array<{ id?: string; url?: string }> }
      | undefined
    if (!raw) return { missing: true as const }
    const images = (raw.images ?? [])
      .filter((image) => typeof image.url === "string")
      .map((image) => ({ id: image.id, url: image.url as string }))
    const productModule = req.scope.resolve(Modules.PRODUCT) as {
      updateProducts: (
        productId: string,
        update: { thumbnail?: string | null; images: Array<{ id?: string; url: string }> }
      ) => Promise<unknown>
    }
    await productModule.updateProducts(id, {
      thumbnail: raw.thumbnail ?? null,
      images: [...images, { url }],
    })
    return { missing: false as const, status: raw.status ?? null, thumbnail: raw.thumbnail ?? null, count: images.length }
  })
  if (!locked.ok) {
    res.status(500).json({ message: "Кадр не записан. Повторите" })
    return
  }
  if (locked.value.missing) {
    res.status(404).json({ message: "Товар не найден" })
    return
  }
  const product = await loadSellerProductById(query, id)
  const audit = await appendDeskAudit(req, {
    actorId: gate.actorId,
    actorEmail: gate.email,
    entityType: "product",
    entityId: id,
    action: "media.upload",
    before: {
      status: locked.value.status,
      thumbnail: locked.value.thumbnail,
      count: locked.value.count,
    },
    after: {
      status: product?.status ?? locked.value.status,
      thumbnail: product?.thumbnail ?? locked.value.thumbnail,
      url,
      count: product?.images?.length ?? locked.value.count + 1,
    },
  })
  res.status(201).json({ product, url, audit })
}
