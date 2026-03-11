import { MedusaService } from "@medusajs/framework/utils"
import { RoomSet } from "./models/room-set"
import { RoomSetItem } from "./models/room-set-item"

class RoomSetModuleService extends MedusaService({
  RoomSet,
  RoomSetItem,
}) {}

export default RoomSetModuleService
