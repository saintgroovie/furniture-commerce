import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ROOM_SET_MODULE } from "../../../../modules/room-set"
import RoomSetModuleService from "../../../../modules/room-set/service"

/** Opt-in lean projection for catalog kids membership (product ids only). */
const PRODUCT_IDS_VIEW = "product_ids"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const slug = req.params.slug as string
  const viewRaw = req.query?.view
  const view =
    typeof viewRaw === "string"
      ? viewRaw
      : Array.isArray(viewRaw)
        ? String(viewRaw[0] ?? "")
        : ""

  const roomSetService = req.scope.resolve(ROOM_SET_MODULE) as RoomSetModuleService
  const list = await roomSetService.listRoomSets(
    { slug, is_active: true },
    { take: 1 }
  )
  const roomSet = list[0]
  if (!roomSet) {
    res.status(404).json({ message: "Room set not found" })
    return
  }
  const query = req.scope.resolve("query") as {
    graph: (args: {
      entity: string
      fields: string[]
      filters?: Record<string, unknown>
    }) => Promise<{ data: unknown[] }>
  }

  if (view === PRODUCT_IDS_VIEW) {
    const { data: itemsLean } = await query.graph({
      entity: "room_set_item",
      fields: ["id", "sort_order", "products.id"],
      filters: { room_set_id: roomSet.id },
    })
    const items: Array<Record<string, unknown> & { product: { id: string } }> =
      []
    for (const row of itemsLean ?? []) {
      const item = row as Record<string, unknown> & {
        sort_order?: number
        products?: Array<{ id?: string }>
      }
      const productId = item.products?.[0]?.id
      if (typeof productId !== "string" || !productId) {
        res.status(500).json({
          message: "Room set item missing product id (product_ids view)",
        })
        return
      }
      const { products: _products, ...rest } = item
      items.push({ ...rest, product: { id: productId } })
    }
    items.sort((a, b) => ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0))
    res.json({ room_set: { ...roomSet, items } })
    return
  }

  const { data: itemsWithProduct } = await query.graph({
    entity: "room_set_item",
    fields: [
      "*",
      "products.*",
      "products.variants.*",
      "products.product_classification.product_type",
    ],
    filters: { room_set_id: roomSet.id },
  })
  const items = (itemsWithProduct ?? [])
    .map((row) => {
      const item = row as Record<string, unknown> & {
        sort_order?: number
        products?: Array<Record<string, unknown>>
      }
      const product = item.products?.[0]
      const { products: _products, ...rest } = item
      return { ...rest, product }
    })
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  res.json({ room_set: { ...roomSet, items } })
}
