import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ROOM_SET_MODULE } from "../../../../modules/room-set"
import RoomSetModuleService from "../../../../modules/room-set/service"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id as string
  const roomSetService = req.scope.resolve(ROOM_SET_MODULE) as RoomSetModuleService
  const roomSet = await roomSetService.retrieveRoomSet(id)
  if (!roomSet) {
    res.status(404).json({ message: "Room set not found" })
    return
  }
  const query = req.scope.resolve("query") as {
    graph: (args: { entity: string; fields: string[]; filters?: Record<string, unknown> }) => Promise<{ data: unknown[] }>
  }
  const { data: itemsWithProduct } = await query.graph({
    entity: "room_set_item",
    fields: ["*", "product.*"],
    filters: { room_set_id: id },
  })
  const items = (itemsWithProduct ?? []) as Array<Record<string, unknown> & { sort_order?: number }>
  items.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  res.json({ room_set: { ...roomSet, items } })
}

export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id as string
  const body = req.body as Record<string, unknown>
  const roomSetService = req.scope.resolve(ROOM_SET_MODULE) as RoomSetModuleService
  const updated = await roomSetService.updateRoomSets({ id, ...body })
  const roomSet = Array.isArray(updated) ? updated[0] : updated
  res.json({ room_set: roomSet })
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id as string
  const roomSetService = req.scope.resolve(ROOM_SET_MODULE) as RoomSetModuleService
  await roomSetService.deleteRoomSets([id])
  res.status(200).json({ id, deleted: true })
}
