import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ROOM_SET_MODULE } from "../../../../modules/room-set"
import RoomSetModuleService from "../../../../modules/room-set/service"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const slug = req.params.slug as string
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
    graph: (args: { entity: string; fields: string[]; filters?: Record<string, unknown> }) => Promise<{ data: unknown[] }>
  }
  const { data: itemsWithProduct } = await query.graph({
    entity: "room_set_item",
    fields: ["*", "products.*", "products.variants.*", "products.product_classification.product_type"],
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
