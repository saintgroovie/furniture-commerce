import { model } from "@medusajs/framework/utils"

/**
 * Staff link from an existing lead (the person) to a Medusa customer
 * and a Medusa admin user. Does not copy orders, payments, or addresses.
 */
export const PersonLink = model.define("woodright_person_link", {
  id: model.id().primaryKey(),
  lead_id: model.text().unique(),
  customer_id: model.text().nullable(),
  assignee_id: model.text().nullable(),
  match_status: model
    .enum(["unlinked", "linked", "needs_review"])
    .default("unlinked"),
})
