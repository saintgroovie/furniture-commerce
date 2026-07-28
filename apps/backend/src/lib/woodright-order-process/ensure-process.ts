import type { OrderProcessStage } from "./stages"
import type { ProcessRecord } from "./transition"

/** Minimal shape of order-process MedusaService methods used by API/subscribers. */
export type OrderProcessServiceLike = {
  listWoodrightOrderProcesses: (
    filters?: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<ProcessRecord[]>
  createWoodrightOrderProcesses: (
    data: Record<string, unknown>
  ) => Promise<ProcessRecord | ProcessRecord[]>
  updateWoodrightOrderProcesses: (
    data: Record<string, unknown>
  ) => Promise<ProcessRecord | ProcessRecord[]>
  listWoodrightOrderProcessEvents: (
    filters?: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<Array<Record<string, unknown>>>
  createWoodrightOrderProcessEvents: (
    data: Record<string, unknown>
  ) => Promise<Record<string, unknown> | Record<string, unknown>[]>
  createWoodrightNotificationDeliveries: (
    data: Record<string, unknown>
  ) => Promise<Record<string, unknown> | Record<string, unknown>[]>
  updateWoodrightNotificationDeliveries: (
    data: Record<string, unknown>
  ) => Promise<unknown>
  listWoodrightOrderAccesses: (
    filters?: Record<string, unknown>
  ) => Promise<Array<Record<string, unknown>>>
  createWoodrightOrderAccesses: (
    data: Record<string, unknown>
  ) => Promise<Record<string, unknown> | Record<string, unknown>[]>
  updateWoodrightOrderAccesses: (
    data: Record<string, unknown>
  ) => Promise<unknown>
  deleteWoodrightOrderAccesses: (ids: string[]) => Promise<unknown>
}

export function asProcessRecord(row: Record<string, unknown>): ProcessRecord {
  return {
    id: String(row.id),
    order_id: String(row.order_id),
    current_stage: row.current_stage as OrderProcessStage,
    previous_stage: (row.previous_stage as OrderProcessStage | null) ?? null,
    version: Number(row.version ?? 1),
    estimated_completion_date:
      row.estimated_completion_date != null
        ? String(row.estimated_completion_date)
        : null,
    customer_message:
      row.customer_message != null ? String(row.customer_message) : null,
    internal_note:
      row.internal_note != null ? String(row.internal_note) : null,
    paused_reason:
      row.paused_reason != null ? String(row.paused_reason) : null,
  }
}

export async function ensureOrderProcess(
  service: OrderProcessServiceLike,
  orderId: string,
  opts: { source?: string; actor_type?: "system" | "admin" } = {}
): Promise<{ process: ProcessRecord; created: boolean }> {
  const existing = await service.listWoodrightOrderProcesses({
    order_id: orderId,
  })
  if (existing?.length) {
    return { process: asProcessRecord(existing[0] as unknown as Record<string, unknown>), created: false }
  }

  const createdRaw = await service.createWoodrightOrderProcesses({
    order_id: orderId,
    current_stage: "new",
    previous_stage: null,
    version: 1,
    estimated_completion_date: null,
    customer_message: null,
    internal_note: null,
    paused_reason: null,
  })
  const process = asProcessRecord(
    (Array.isArray(createdRaw) ? createdRaw[0] : createdRaw) as unknown as Record<
      string,
      unknown
    >
  )

  await service.createWoodrightOrderProcessEvents({
    process_id: process.id,
    order_id: orderId,
    previous_stage: null,
    next_stage: "new",
    event_type: "created",
    actor_type: opts.actor_type ?? "system",
    actor_id: null,
    actor_display: null,
    customer_visible: true,
    customer_message: "Мы получили ваш заказ",
    internal_note: null,
    notification_requested: false,
    source: opts.source ?? "ensure",
    idempotency_key: `created:${orderId}`,
    correlation_id: null,
  })

  return { process, created: true }
}
