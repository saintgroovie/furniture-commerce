import { model } from "@medusajs/framework/utils"

export const PersonNote = model.define("woodright_person_note", {
  id: model.id().primaryKey(),
  lead_id: model.text(),
  body: model.text(),
  created_by: model.text().nullable(),
})
