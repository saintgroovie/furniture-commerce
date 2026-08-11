import { model } from "@medusajs/framework/utils"

export const RoomSetItem = model.define("room_set_item", {
  id: model.id().primaryKey(),
  room_set_id: model.text(),
  quantity: model.number().default(1),
  sort_order: model.number().default(0),
})
