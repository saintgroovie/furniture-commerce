import { model } from "@medusajs/framework/utils"

export const PaymentLink = model.define("payment_link", {
  id: model.id().primaryKey(),
  entity_type: model.enum(["order", "lead"]),
  entity_id: model.text(),
  amount: model.number(),
  currency_code: model.text(),
  url: model.text(),
  purpose: model.text().nullable(),
  status: model
    .enum(["created", "sent", "paid", "expired"])
    .default("created"),
  expires_at: model.dateTime().nullable(),
})
