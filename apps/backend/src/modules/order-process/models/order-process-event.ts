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

export const WoodrightOrderProcessEvent = model.define(
  "woodright_order_process_event",
  {
    id: model.id().primaryKey(),
    process_id: model.text(),
    order_id: model.text(),
    previous_stage: model.enum([...STAGES]).nullable(),
    next_stage: model.enum([...STAGES]),
    event_type: model.text(),
    actor_type: model.enum(["system", "admin", "customer"]),
    actor_id: model.text().nullable(),
    actor_display: model.text().nullable(),
    customer_visible: model.boolean().default(true),
    customer_message: model.text().nullable(),
    internal_note: model.text().nullable(),
    notification_requested: model.boolean().default(false),
    notification_result: model.text().nullable(),
    source: model.text(),
    idempotency_key: model.text().nullable(),
    correlation_id: model.text().nullable(),
  }
)
