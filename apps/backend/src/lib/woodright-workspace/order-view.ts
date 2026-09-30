import { STAGE_OWNER_LABEL, type OrderProcessStage } from "../woodright-order-process/stages"

export type WorkspaceOrderFilter =
  | "all"
  | "new"
  | "action"
  | "waiting"
  | "production"
  | "ready"
  | "fulfilled"

export const ORDER_FILTER_LABEL: Record<WorkspaceOrderFilter, string> = {
  all: "Все",
  new: "Новые",
  action: "Требуют действия",
  waiting: "Ждём клиента",
  production: "В производстве",
  ready: "Готовы",
  fulfilled: "Отгружены",
}

const ACTION_STAGES = new Set(["needs_confirmation", "specification_in_progress"])
const PRODUCTION_STAGES = new Set(["confirmed", "in_production", "quality_control"])

export type OrderProcessSnapshot = {
  order_id: string
  current_stage: string
  internal_note?: string | null
}

export type OrderListFact = {
  id: string
  display_id: string | number | null
  email: string | null
  person_name: string | null
  phone: string | null
  total: number | string | null
  currency_code: string | null
  payment_status: string | null
  fulfillment_status: string | null
  created_at: string | null
  medusa_status: string | null
}

export type WorkspaceOrderRow = OrderListFact & {
  manufacturing_stage: string | null
  manufacturing_label: string | null
  action_needed: boolean
}

export function stageLabel(stage: string | null | undefined): string | null {
  if (!stage) return null
  return STAGE_OWNER_LABEL[stage as OrderProcessStage] ?? stage
}

export function matchesOrderFilter(
  row: { manufacturing_stage: string | null; fulfillment_status: string | null },
  filter: WorkspaceOrderFilter
): boolean {
  const stage = row.manufacturing_stage
  const fulfillment = (row.fulfillment_status ?? "").toLowerCase()
  switch (filter) {
    case "all":
      return true
    case "new":
      return stage === "new" || stage == null
    case "action":
      return stage != null && ACTION_STAGES.has(stage)
    case "waiting":
      return stage === "awaiting_customer_approval"
    case "production":
      return stage != null && PRODUCTION_STAGES.has(stage)
    case "ready":
      return stage === "ready_for_delivery"
    case "fulfilled":
      return fulfillment === "fulfilled" || fulfillment === "shipped" || fulfillment === "delivered"
    default:
      return true
  }
}

export function joinOrdersWithProcesses(
  orders: OrderListFact[],
  processes: OrderProcessSnapshot[]
): WorkspaceOrderRow[] {
  const byOrder = new Map(processes.map((process) => [process.order_id, process]))
  return orders.map((order) => {
    const process = byOrder.get(order.id) ?? null
    const stage = process?.current_stage ?? null
    return {
      ...order,
      manufacturing_stage: stage,
      manufacturing_label: stageLabel(stage),
      action_needed: stage != null && (ACTION_STAGES.has(stage) || stage === "awaiting_customer_approval"),
    }
  })
}

export function parseOrderFilter(raw: string | null | undefined): WorkspaceOrderFilter {
  const allowed: WorkspaceOrderFilter[] = [
    "all",
    "new",
    "action",
    "waiting",
    "production",
    "ready",
    "fulfilled",
  ]
  if (raw && (allowed as string[]).includes(raw)) return raw as WorkspaceOrderFilter
  return "all"
}
