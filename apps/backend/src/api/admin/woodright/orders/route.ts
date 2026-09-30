import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ORDER_PROCESS_MODULE } from "../../../../modules/order-process"
import { queryOf } from "../../../../lib/woodright-workspace/load-seller-products"
import {
  joinOrdersWithProcesses,
  matchesOrderFilter,
  parseOrderFilter,
  type OrderListFact,
  type OrderProcessSnapshot,
} from "../../../../lib/woodright-workspace/order-view"

const PAGE = 30

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function text(value: unknown): string | null {
  if (typeof value === "string") return value
  if (typeof value === "number") return String(value)
  return null
}

function money(value: unknown): number | string | null {
  if (typeof value === "number" || typeof value === "string") return value
  const record = asRecord(value)
  if (record && (typeof record.numeric === "number" || typeof record.numeric === "string")) {
    return record.numeric as number | string
  }
  return null
}

function toFact(raw: Record<string, unknown>): OrderListFact {
  const customer = asRecord(raw.customer)
  const first = text(customer?.first_name)
  const last = text(customer?.last_name)
  const name = [first, last].filter(Boolean).join(" ") || null
  return {
    id: String(raw.id),
    display_id: (typeof raw.display_id === "number" || typeof raw.display_id === "string") ? raw.display_id : null,
    email: text(raw.email) ?? text(customer?.email),
    person_name: name,
    phone: text(customer?.phone),
    total: money(raw.total),
    currency_code: text(raw.currency_code),
    payment_status: text(raw.payment_status),
    fulfillment_status: text(raw.fulfillment_status),
    created_at: text(raw.created_at),
    medusa_status: text(raw.status),
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const filter = parseOrderFilter(typeof req.query.filter === "string" ? req.query.filter : null)
  const offset = Math.max(0, Number(req.query.offset ?? 0) || 0)
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
      "customer.phone",
    ],
    pagination: { take: PAGE, skip: offset },
  })
  const facts = ((data ?? []) as Record<string, unknown>[]).map(toFact)
  const service = req.scope.resolve(ORDER_PROCESS_MODULE) as {
    listWoodrightOrderProcesses: (filters: object) => Promise<Array<Record<string, unknown>>>
  }
  const processes = await service.listWoodrightOrderProcesses({})
  const snapshots: OrderProcessSnapshot[] = (processes ?? []).map((row) => ({
    order_id: String(row.order_id),
    current_stage: String(row.current_stage),
    internal_note: text(row.internal_note),
  }))
  const joined = joinOrdersWithProcesses(facts, snapshots).filter((row) => matchesOrderFilter(row, filter))
  res.json({
    orders: joined,
    filter,
    offset,
    limit: PAGE,
    has_more: facts.length === PAGE,
  })
}
