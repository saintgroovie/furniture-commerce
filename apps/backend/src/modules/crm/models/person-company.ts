import { model } from "@medusajs/framework/utils"

export const PersonCompany = model.define("woodright_person_company", {
  id: model.id().primaryKey(),
  lead_id: model.text(),
  company_id: model.text(),
})
