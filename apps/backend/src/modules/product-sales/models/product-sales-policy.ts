import { model } from "@medusajs/framework/utils"

export const ProductSalesPolicy = model.define("product_sales_policy", {
  id: model.id().primaryKey(),
  sales_mode: model.enum([
    "in_stock",
    "made_to_order",
    "configurable_to_order",
    "quote_required",
    "bespoke_project",
    "showroom_sample",
    "unavailable",
  ]),
  modifiers: model.json().nullable(),
  lead_time_text: model.text().nullable(),
  buyer_message: model.text().nullable(),
  manager_confirmation_required: model.boolean().default(false),
  related_room_set_id: model.text().nullable(),
  showroom_sample_available: model.boolean().default(false),
  unavailable_reason: model.text().nullable(),
  policy_source: model.enum(["override", "unspecified"]).default("override"),
})
