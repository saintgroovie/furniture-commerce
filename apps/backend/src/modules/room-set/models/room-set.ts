import { model } from "@medusajs/framework/utils"

export const RoomSet = model.define("room_set", {
  id: model.id().primaryKey(),
  title: model.text(),
  slug: model.text().unique(),
  description: model.text().nullable(),
  hero_image: model.text().nullable(),
  gallery: model.json().nullable(),
  price_from: model.number().nullable(),
  room_type: model.text().nullable(),
  style: model.text().nullable(),
  is_active: model.boolean().default(true),
})
