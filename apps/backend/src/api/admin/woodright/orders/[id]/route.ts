import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ORDER_PROCESS_MODULE } from "../../../../../modules/order-process"
import { queryOf } from "../../../../../lib/woodright-workspace/load-seller-products"
import { projectOrderActivity } from "../../../../../lib/woodright-workspace/activity"
import { stageLabel } from "../../../../../lib/woodright-workspace/order-view"

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

/**
 * Read model. Does not create an order process.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id as string
  const query = queryOf(req)
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "total",
      "currency_code",
      "payment_status",
      "fulfillment_status",
      "created_at",
      "status",
      "customer.first_name",
      "customer.last_name",
      "customer.email",
      "customer.phone",
      "items.id",
      "items.title",
      "items.quantity",
      "items.unit_price",
    ],
    filters: { id },
  })
  const order = asRecord((data ?? [])[0])
  if (!order) {
    res.status(404).json({ message: "Заказ не найден" })
    return
  }

  const service = req.scope.resolve(ORDER_PROCESS_MODULE) as {
    listWoodrightOrderProcesses: (filters: object) => Promise<Array<Record<string, unknown>>>
    listWoodrightOrderProcessEvents: (filters: object, config?: object) => Promise<Array<Record<string, unknown>>>
  }
  const processes = await service.listWoodrightOrderProcesses({ order_id: id })
  const process = processes?.[0] ?? null
  const events = process
    ? await service.listWoodrightOrderProcessEvents(
        { process_id: String(process.id) },
        { order: { created_at: "ASC" } }
      )
    : []
  const stage = process ? String(process.current_stage) : null
  const activity = projectOrderActivity({
    orderId: id,
    createdAt: text(order.created_at),
    events: (events ?? []).map((event) => ({
      id: String(event.id),
      created_at: text(event.created_at),
      event_type: text(event.event_type),
      previous_stage: text(event.previous_stage),
      next_stage: text(event.next_stage),
      internal_note: text(event.internal_note),
    })),
  })

  res.json({
    order,
    process: process
      ? {
          id: String(process.id),
          current_stage: stage,
          label: stageLabel(stage),
          internal_note: text(process.internal_note),
          customer_message: text(process.customer_message),
          version: process.version ?? null,
        }
      : null,
    activity,
  })
}
