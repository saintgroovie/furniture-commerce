import { model } from "@medusajs/framework/utils"

export const Lead = model.define("lead", {
  id: model.id().primaryKey(),
  source: model.enum(["bespoke", "room_adapt", "contact"]),
  name: model.text().nullable(),
  email: model.text().nullable(),
  phone: model.text().nullable(),
  comment: model.text().nullable(),
  payload: model.json().nullable(),
  status: model.text().nullable(),
})
