import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { BESPOKE_REQUEST_MODULE } from "../../../../../modules/bespoke-request"
import { LEAD_MODULE } from "../../../../../modules/lead"
import { PERSON_LINK_MODULE } from "../../../../../modules/person-link"
import { auditActionText, manufacturingText, noteActivity, projectActivity } from "../../../../../lib/woodright-crm/activity"
import { readPersonCrm } from "../../../../../lib/woodright-crm/read-person-crm"
import { matchCandidates, normalizeEmail, withholdIncompleteLookup } from "../../../../../lib/woodright-workspace/identity"
import { listDeskAuditActions } from "../../../../../lib/woodright-workspace/desk-audit"
import { queryOf } from "../../../../../lib/woodright-workspace/load-seller-products"
import { CRM_MODULE } from "../../../../../modules/crm"
import { ORDER_PROCESS_MODULE } from "../../../../../modules/order-process"

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function suggestionPayload(
  suggestion: { status: string; ids: string[]; lookup_incomplete?: boolean },
  customers: Array<{ id: string; email: string | null; phone: string | null }>
) {
  const byId = new Map(customers.map((customer) => [customer.id, customer]))
  const candidates = suggestion.ids.map((id) => {
    const customer = byId.get(id)
    return {
      id,
      email: customer?.email ?? null,
      phone: customer?.phone ?? null,
    }
  })
  const lookup_incomplete = suggestion.lookup_incomplete === true
  if (suggestion.status === "needs_review") {
    return { status: "needs_review", customer_ids: suggestion.ids, candidates, lookup_incomplete }
  }
  if (suggestion.status === "linked") {
    return { status: "candidate", customer_ids: suggestion.ids, candidates, lookup_incomplete }
  }
  return { status: "none", customer_ids: [], candidates: [], lookup_incomplete }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id as string
  const leadService = req.scope.resolve(LEAD_MODULE) as {
    retrieveLead: (id: string) => Promise<Record<string, unknown> | null>
  }
  const lead = await leadService.retrieveLead(id)
  if (!lead) {
    res.status(404).json({ message: "Человек не найден" })
    return
  }
  const requests = await (req.scope.resolve(BESPOKE_REQUEST_MODULE) as {
    listBespokeRequests: (filters: object) => Promise<Array<Record<string, unknown>>>
  }).listBespokeRequests({ lead_id: id })

  let link: Record<string, unknown> | null = null
  let linksAvailable = true
  try {
    const rows = await (req.scope.resolve(PERSON_LINK_MODULE) as {
      listPersonLinks: (filters: object) => Promise<Array<Record<string, unknown>>>
    }).listPersonLinks({ lead_id: id })
    link = rows?.[0] ?? null
  } catch {
    linksAvailable = false
  }

  const email = text(lead.email)
  const phone = text(lead.phone)
  let customers: Array<{ id: string; email: string | null; phone: string | null }> = []
  let phoneLookupFailed = false
  try {
    const query = queryOf(req)
    const rows = new Map<string, { id: string; email: string | null; phone: string | null }>()
    const collect = (data: unknown) => {
      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        const id = String(row.id)
        rows.set(id, { id, email: text(row.email), phone: text(row.phone) })
      }
    }
    if (email) {
      try {
        const byEmail = await query.graph({
          entity: "customer",
          fields: ["id", "email", "phone", "first_name", "last_name"],
          filters: { email: normalizeEmail(email) ?? email },
          pagination: { take: 5, skip: 0 },
        })
        collect(byEmail.data)
      } catch {
        // email lookup is optional for the suggestion
      }
    }
    if (phone) {
      try {
        const byPhone = await query.graph({
          entity: "customer",
          fields: ["id", "email", "phone", "first_name", "last_name"],
          filters: { phone },
          pagination: { take: 5, skip: 0 },
        })
        collect(byPhone.data)
      } catch {
        phoneLookupFailed = true
      }
    }
    customers = [...rows.values()]
  } catch {
    customers = []
    phoneLookupFailed = Boolean(phone)
  }
  const suggestion = withholdIncompleteLookup(matchCandidates(customers, { email, phone }), {
    phonePresent: Boolean(phone),
    phoneLookupFailed,
  })

  let orders: Array<Record<string, unknown>> = []
  const customerId = link ? text(link.customer_id) : null
  if (customerId) {
    try {
      const query = queryOf(req)
      const result = await query.graph({
        entity: "order",
        fields: ["id", "display_id", "created_at", "total", "currency_code", "payment_status"],
        filters: { customer_id: customerId },
        pagination: { take: 20, skip: 0 },
      })
      orders = (result.data ?? []) as Array<Record<string, unknown>>
    } catch {
      orders = []
    }
  }

  let staff: Array<{ id: string; email: string | null }> = []
  try {
    const userModule = req.scope.resolve(Modules.USER) as {
      listUsers: (filters: object, config?: object) => Promise<Array<{ id: string; email?: string | null }>>
    }
    const users = await userModule.listUsers({}, { take: 30 })
    staff = (users ?? []).map((user) => ({ id: user.id, email: user.email ?? null }))
  } catch {
    staff = []
  }

  let crm = null as Awaited<ReturnType<typeof readPersonCrm>> | null
  try {
    crm = await readPersonCrm(req.scope.resolve(CRM_MODULE), id, (requests ?? []).map((row) => String(row.id)))
  } catch {
    crm = null
  }
  const linkedOrderIds = new Set(orders.map((order) => String(order.id)))
  for (const linkRow of crm?.request_orders ?? []) {
    if (linkRow.order_id && !linkedOrderIds.has(linkRow.order_id)) linkedOrderIds.add(linkRow.order_id)
  }
  const manufacturing: Array<{ id: string; at: string | null; source: "manufacturing"; text: string }> = []
  try {
    const processes = req.scope.resolve(ORDER_PROCESS_MODULE) as {
      listWoodrightOrderProcesses: (filters: object) => Promise<Array<Record<string, unknown>>>
      listWoodrightOrderProcessEvents: (filters: object, config?: object) => Promise<Array<Record<string, unknown>>>
    }
    for (const orderId of [...linkedOrderIds].slice(0, 8)) {
      const rows = await processes.listWoodrightOrderProcesses({ order_id: orderId })
      const process = rows?.[0]
      if (!process) continue
      const events = await processes.listWoodrightOrderProcessEvents(
        { process_id: String(process.id) },
        { take: 8, order: { created_at: "DESC" } }
      )
      for (const event of events ?? []) {
        manufacturing.push({
          id: `m:${event.id}`,
          at: event.created_at instanceof Date ? event.created_at.toISOString() : text(event.created_at),
          source: "manufacturing",
          text: manufacturingText(String(event.event_type ?? "")),
        })
      }
    }
  } catch {
    manufacturing.length = 0
  }
  const audits = await listDeskAuditActions(req, [
    { entityType: "person", entityId: id },
    ...(requests ?? []).map((row) => ({ entityType: "request", entityId: String(row.id) })),
  ])
  const activity = projectActivity([
    ...(crm?.notes ?? []).map((note) => noteActivity(note)),
    ...(crm?.follow_ups ?? []).map((item) => ({ id: `fu:${item.id}`, at: item.due_at, source: "follow_up" as const, text: item.summary || "Напоминание" })),
    ...(crm?.companies ?? []).map((company) => ({ id: `co:${company.id}`, at: company.linked_at, source: "company" as const, text: company.name })),
    ...(requests ?? []).map((row) => ({ id: `req:${row.id}`, at: text(row.created_at), source: "request" as const, text: "Заявка" })),
    ...orders.map((order) => ({ id: `ord:${order.id}`, at: text(order.created_at), source: "order" as const, text: `Заказ ${order.display_id ?? ""}`.trim() })),
    ...audits.map((row) => ({ id: `audit:${row.id}`, at: row.created_at, source: "audit" as const, text: auditActionText(row.action) })),
    ...manufacturing,
  ])

  res.json({
    person: {
      id: String(lead.id),
      name: text(lead.name),
      email,
      phone,
      source: text(lead.source),
      comment: text(lead.comment),
      created_at: text(lead.created_at),
      updated_at: text(lead.updated_at),
    },
    requests: requests ?? [],
    orders,
    roles: crm?.roles ?? [],
    companies: crm?.companies ?? [],
    notes: crm?.notes ?? [],
    follow_ups: crm?.follow_ups ?? [],
    follow_ups_truncated: crm?.follow_ups_truncated ?? false,
    request_orders: crm?.request_orders ?? [],
    activity,
    crm_available: crm != null,
    link: link
      ? {
          customer_id: text(link.customer_id),
          assignee_id: text(link.assignee_id),
          match_status: text(link.match_status) ?? "unlinked",
        }
      : null,
    links_available: linksAvailable,
    suggestion: suggestionPayload(suggestion, customers),
    staff,
  })
}
