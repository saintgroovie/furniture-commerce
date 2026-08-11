import { model } from "@medusajs/framework/utils"

export const WoodrightOrderAccess = model.define("woodright_order_access", {
  id: model.id().primaryKey(),
  order_id: model.text().unique(),
  token_hash: model.text(),
  cart_id_hash: model.text().nullable(),
  expires_at: model.dateTime(),
  revoked_at: model.dateTime().nullable(),
})
