import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework/subscribers"
import { Modules } from "@medusajs/framework/utils"
import { ORDER_PROCESS_MODULE } from "../modules/order-process"
import {
  ensureOrderProcess,
  type OrderProcessServiceLike,
} from "../lib/woodright-order-process/ensure-process"
import {
  buildStageNotificationCopy,
  dispatchFakeNotification,
} from "../lib/woodright-order-process/fake-notifications"
import { STAGE_BUYER_LABEL } from "../lib/woodright-order-process/stages"

function notificationsEnabled(): boolean {
  const v = (process.env.WOODRIGHT_NOTIFICATIONS ?? "fake").toLowerCase()
  return v !== "off" && v !== "0" && v !== "false"
}

/**
 * On Medusa order.placed: ensure Woodright process at `new` + created event.
 * Fake notifications when WOODRIGHT_NOTIFICATIONS != off.
 */
export default async function orderPlacedWoodrightProcess({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = data?.id
  if (!orderId) return

  const service = container.resolve(
    ORDER_PROCESS_MODULE
  ) as unknown as OrderProcessServiceLike
  const orderModule = container.resolve(Modules.ORDER) as unknown as {
    retrieveOrder: (
      id: string,
      config?: Record<string, unknown>
    ) => Promise<Record<string, unknown>>
  }

  const ensured = await ensureOrderProcess(service, orderModule, orderId, {
    source: "order.placed",
    actor_type: "system",
  })
  if (!ensured.ok) {
    // Fail-closed: never create process/history without a real Medusa order.
    return
  }
  const { process, created } = ensured

  if (!notificationsEnabled()) return

  const eventId = created
    ? `created:${orderId}`
    : `order.placed.replay:${orderId}`
  const copy = buildStageNotificationCopy({
    stage_label: STAGE_BUYER_LABEL.new,
    customer_message: "Мы получили ваш заказ",
  })

  for (const channel of ["activity", "email"] as const) {
    const status = dispatchFakeNotification({
      event_id: eventId,
      channel,
      recipient_key: `order:${orderId}`,
      subject: copy.subject,
      body: copy.body,
    })
    try {
      await service.createWoodrightNotificationDeliveries({
        event_id: eventId,
        channel,
        recipient_key: `order:${orderId}`,
        status: status === "deduped" ? "deduped" : "sent",
        attempt_count: 1,
      })
    } catch {
      // Delivery table may require a real event FK in future; ignore for MVP.
    }
  }

  void process
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
