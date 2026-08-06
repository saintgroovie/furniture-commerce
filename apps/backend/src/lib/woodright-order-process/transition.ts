import {
  assertStageTransition,
  listAllowedTransitions,
  type OrderProcessStage,
  type TransitionContext,
} from "./stages"

export type ProcessRecord = {
  id: string
  order_id: string
  current_stage: OrderProcessStage
  previous_stage: OrderProcessStage | null
  version: number
  estimated_completion_date: string | null
  customer_message: string | null
  internal_note: string | null
  paused_reason: string | null
}

export type ProcessEventRecord = {
  id: string
  process_id: string
  order_id: string
  previous_stage: OrderProcessStage | null
  next_stage: OrderProcessStage
  event_type: string
  actor_type: "system" | "admin" | "customer"
  actor_id: string | null
  actor_display: string | null
  customer_visible: boolean
  customer_message: string | null
  internal_note: string | null
  notification_requested: boolean
  source: string
  idempotency_key: string | null
  correlation_id: string | null
  created_at: string
}

export type NotificationDeliveryRecord = {
  id: string
  event_id: string
  channel: "email" | "activity"
  recipient_key: string
  status: "pending" | "sent" | "failed" | "skipped" | "deduped"
}

export type TransitionCommand = {
  to_stage: OrderProcessStage
  expected_version: number
  estimated_completion_date?: string | null
  customer_message?: string | null
  internal_note?: string | null
  paused_reason?: string | null
  notify_customer?: boolean
  correction?: boolean
  correction_reason?: string | null
  idempotency_key?: string | null
  actor_type: "system" | "admin" | "customer"
  actor_id?: string | null
  actor_display?: string | null
  source?: string
  medusa_order_canceled?: boolean
  recipient_key?: string
}

/**
 * Pure in-memory CAS transition used by fidelity tests and as the algorithm
 * for the module service (DB transaction must apply the same steps atomically).
 */
export function applyProcessTransitionPure(
  process: ProcessRecord,
  existingIdempotencyKeys: Set<string>,
  cmd: TransitionCommand,
  ids: { event_id: string; delivery_ids: [string, string?] },
  now = new Date()
):
  | {
      ok: true
      process: ProcessRecord
      event: ProcessEventRecord
      deliveries: NotificationDeliveryRecord[]
      replay?: false
    }
  | {
      ok: true
      replay: true
      process: ProcessRecord
    }
  | { ok: false; code: string; message: string; http: 400 | 409 } {
  const key = cmd.idempotency_key?.trim() || null
  if (key && existingIdempotencyKeys.has(key)) {
    return { ok: true, replay: true, process }
  }

  if (cmd.expected_version !== process.version) {
    return {
      ok: false,
      code: "STALE_PROCESS_VERSION",
      message: "Статус уже изменён другим сотрудником - обновите страницу",
      http: 409,
    }
  }

  const ctx: TransitionContext = {
    correction: Boolean(cmd.correction),
    correction_reason: cmd.correction_reason,
    previous_stage: process.previous_stage,
    medusa_order_canceled: Boolean(cmd.medusa_order_canceled),
  }
  const gate = assertStageTransition(
    process.current_stage,
    cmd.to_stage,
    ctx
  )
  if (!gate.ok) {
    return { ok: false, code: gate.code, message: gate.message, http: 400 }
  }

  const prev = process.current_stage
  const nextProcess: ProcessRecord = {
    ...process,
    previous_stage: prev,
    current_stage: cmd.to_stage,
    version: process.version + 1,
    estimated_completion_date:
      cmd.estimated_completion_date !== undefined
        ? cmd.estimated_completion_date
        : process.estimated_completion_date,
    customer_message:
      cmd.customer_message !== undefined
        ? cmd.customer_message
        : process.customer_message,
    internal_note:
      cmd.internal_note !== undefined
        ? cmd.internal_note
        : process.internal_note,
    paused_reason:
      cmd.to_stage === "on_hold"
        ? cmd.paused_reason ?? cmd.customer_message ?? process.paused_reason
        : null,
  }

  const event: ProcessEventRecord = {
    id: ids.event_id,
    process_id: process.id,
    order_id: process.order_id,
    previous_stage: prev,
    next_stage: cmd.to_stage,
    event_type:
      cmd.to_stage === "on_hold"
        ? "paused"
        : prev === "on_hold"
          ? "resumed"
          : "stage_changed",
    actor_type: cmd.actor_type,
    actor_id: cmd.actor_id ?? null,
    actor_display: cmd.actor_display ?? null,
    customer_visible: true,
    customer_message: cmd.customer_message ?? null,
    internal_note: cmd.internal_note ?? null,
    notification_requested: Boolean(cmd.notify_customer),
    source: cmd.correction ? "correction" : cmd.source ?? "admin_api",
    idempotency_key: key,
    correlation_id: null,
    created_at: now.toISOString(),
  }

  const deliveries: NotificationDeliveryRecord[] = []
  if (cmd.notify_customer) {
    const recipient = cmd.recipient_key ?? `order:${process.order_id}`
    deliveries.push({
      id: ids.delivery_ids[0],
      event_id: event.id,
      channel: "activity",
      recipient_key: recipient,
      status: "pending",
    })
    if (ids.delivery_ids[1]) {
      deliveries.push({
        id: ids.delivery_ids[1],
        event_id: event.id,
        channel: "email",
        recipient_key: recipient,
        status: "pending",
      })
    }
  }

  if (key) existingIdempotencyKeys.add(key)

  return { ok: true, process: nextProcess, event, deliveries, replay: false }
}

export function allowedTransitionsForAdmin(
  process: ProcessRecord,
  medusaCanceled: boolean
): OrderProcessStage[] {
  return listAllowedTransitions(process.current_stage, {
    previous_stage: process.previous_stage,
    medusa_order_canceled: medusaCanceled,
  })
}

/** Store DTO: strip internal fields. */
export function toStoreProcessEvent(event: ProcessEventRecord) {
  return {
    id: event.id,
    at: event.created_at,
    label: event.next_stage,
    message: event.customer_visible ? event.customer_message : null,
    customer_visible: event.customer_visible,
  }
}
