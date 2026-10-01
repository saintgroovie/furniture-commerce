import { model } from "@medusajs/framework/utils"

/** Points a request at an existing Medusa order. The order row is not copied. */
export const RequestOrder = model.define("woodright_request_order", {
  id: model.id().primaryKey(),
  request_id: model.text(),
  order_id: model.text(),
})
