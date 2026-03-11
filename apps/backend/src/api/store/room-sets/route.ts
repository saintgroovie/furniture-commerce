import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ROOM_SET_MODULE } from "../../../modules/room-set"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const roomSetService = req.scope.resolve(ROOM_SET_MODULE)
  const list = await roomSetService.listRoomSets(
    { is_active: true },
    { order: { created_at: "DESC" } }
  )
  res.json({ room_sets: list })
}
