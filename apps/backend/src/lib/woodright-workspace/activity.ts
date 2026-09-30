import { STAGE_OWNER_LABEL, type OrderProcessStage } from "../woodright-order-process/stages"

export type ActivityItem = {
  id: string
  at: string | null
  kind: "order_created" | "stage_changed" | "note"
  label: string
  detail: string | null
}

export type ProcessEventFact = {
  id: string
  created_at?: string | null
  event_type?: string | null
  previous_stage?: string | null
  next_stage?: string | null
  internal_note?: string | null
}

/**
 * Read model only. Payment and fulfillment stay on the order fact,
 * because we do not have a confirmed event stream for them.
 */
export function projectOrderActivity(input: {
  orderId: string
  createdAt?: string | null
  events?: ProcessEventFact[] | null
}): ActivityItem[] {
  const items: ActivityItem[] = []
  if (input.createdAt) {
    items.push({
      id: `created:${input.orderId}`,
      at: input.createdAt,
      kind: "order_created",
      label: "Заказ создан",
      detail: null,
    })
  }
  for (const event of input.events ?? []) {
    if (event.next_stage || event.event_type) {
      items.push({
        id: `stage:${event.id}`,
        at: event.created_at ?? null,
        kind: "stage_changed",
        label: "Этап изготовления изменён",
        detail: event.next_stage
          ? STAGE_OWNER_LABEL[event.next_stage as OrderProcessStage] ?? event.next_stage
          : event.event_type ?? null,
      })
    }
    const note = event.internal_note?.trim()
    if (note) {
      items.push({
        id: `note:${event.id}`,
        at: event.created_at ?? null,
        kind: "note",
        label: "Внутренняя заметка",
        detail: note,
      })
    }
  }
  return items
}
