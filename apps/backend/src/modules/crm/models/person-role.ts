import { model } from "@medusajs/framework/utils"

export const PersonRoleRow = model.define("woodright_person_role", {
  id: model.id().primaryKey(),
  lead_id: model.text(),
  role: model.enum(["buyer", "designer", "architect", "company_representative", "partner"]),
})
