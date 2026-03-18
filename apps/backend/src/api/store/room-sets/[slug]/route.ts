import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ROOM_SET_MODULE } from "../../../../modules/room-set"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const slug = req.params.slug as string
  const roomSetService = req.scope.resolve(ROOM_SET_MODULE) as any
  const list = await roomSetService.listRoomSets({ slug }, { take: 1 })
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
    fields: ["*", "product.*", "product.product_classification.*", "product.variants.*", "product.variants.prices.*"],
    filters: { room_set_id: roomSet.id },
  })
  const items = ((itemsWithProduct ?? []) as Array<Record<string, unknown> & { sort_order?: number }>)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  res.json({ room_set: { ...roomSet, items } })
}
