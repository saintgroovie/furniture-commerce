import { model } from "@medusajs/framework/utils"

export const Company = model.define("woodright_company", {
  id: model.id().primaryKey(),
  name: model.text(),
  type: model.enum(["design_studio", "architecture_bureau", "partner", "other"]).nullable(),
  internal_note: model.text().nullable(),
})
