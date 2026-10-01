import { model } from "@medusajs/framework/utils"

export const BESPOKE_REQUEST_STATUS = [
  "new",
  "contacted",
  "quote_sent",
  "paid",
  "in_production",
  "completed",
] as const

export type BespokeRequestStatus = (typeof BESPOKE_REQUEST_STATUS)[number]

export const BespokeRequest = model.define("bespoke_request", {
  id: model.id().primaryKey(),
  lead_id: model.text(),
  product_id: model.text().nullable(),
  room_set_id: model.text().nullable(),
  dimensions: model.text().nullable(),
  materials: model.text().nullable(),
  budget: model.text().nullable(),
  comment: model.text().nullable(),
  status: model
    .enum([
      "new",
      "contacted",
      "quote_sent",
      "paid",
      "in_production",
      "completed",
    ])
    .default("new"),
  internal_notes: model.text().nullable(),
  quoted_at: model.dateTime().nullable(),
  /** Studio or bureau behind the request. Null until a person is linked to a company. */
  company_id: model.text().nullable(),
  /** The other person: end customer when the contact is a designer, or the designer. */
  counterparty_lead_id: model.text().nullable(),
})
