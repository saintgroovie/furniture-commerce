import { model } from "@medusajs/framework/utils"

const STAGES = [
  "new",
  "needs_confirmation",
  "specification_in_progress",
  "awaiting_customer_approval",
  "confirmed",
  "in_production",
  "quality_control",
  "ready_for_delivery",
  "on_hold",
  "canceled",
] as const

export const WoodrightOrderProcess = model.define("woodright_order_process", {
  id: model.id().primaryKey(),
  order_id: model.text().unique(),
  current_stage: model.enum([...STAGES]).default("new"),
  previous_stage: model.enum([...STAGES]).nullable(),
  estimated_completion_date: model.dateTime().nullable(),
  customer_message: model.text().nullable(),
  internal_note: model.text().nullable(),
  paused_reason: model.text().nullable(),
  version: model.number().default(1),
})
