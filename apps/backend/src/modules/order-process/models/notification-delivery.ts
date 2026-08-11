import { model } from "@medusajs/framework/utils"

export const WoodrightNotificationDelivery = model.define(
  "woodright_notification_delivery",
  {
    id: model.id().primaryKey(),
    event_id: model.text(),
    channel: model.enum(["email", "activity"]),
    recipient_key: model.text(),
    status: model
      .enum(["pending", "sent", "failed", "skipped", "deduped"])
      .default("pending"),
    attempt_count: model.number().default(0),
    last_error: model.text().nullable(),
  }
)
