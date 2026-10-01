import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { COMPANY_TYPE_LABEL, type CompanyType } from "../../../../../lib/woodright-crm/constants"
import { auditActionText, projectActivity } from "../../../../../lib/woodright-crm/activity"
import { requireDeskWrite } from "../../../../../lib/woodright-workspace/require-desk-write"
import { BESPOKE_REQUEST_MODULE } from "../../../../../modules/bespoke-request"
import { CRM_MODULE } from "../../../../../modules/crm"
import { LEAD_MODULE } from "../../../../../modules/lead"

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null
}
function time(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString()
  return text(value)
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const gate = await requireDeskWrite(req, res, "crm.view")
  if (!gate) return
  const id = req.params.id as string
  let crm: {
    retrieveCompany: (id: string) => Promise<Record<string, unknown> | null>
    listPersonCompanies: (filters: object) => Promise<Array<Record<string, unknown>>>
    listFollowUps: (filters: object) => Promise<Array<Record<string, unknown>>>
    listRequestOrders: (filters: object) => Promise<Array<Record<string, unknown>>>
  }
  try {
    crm = req.scope.resolve(CRM_MODULE)
  } catch {
    res.status(503).json({ code: "crm_unavailable", message: "Компании ещё не включены в базе" })
    return
  }
  const company = await crm.retrieveCompany(id)
  if (!company) {
    res.status(404).json({ message: "Компания не найдена" })
    return
  }
  const memberships = await crm.listPersonCompanies({ company_id: id })
  const leadIds = memberships.map((row) => text(row.lead_id)).filter((value): value is string => Boolean(value))
  const leadRows = leadIds.length
    ? await (req.scope.resolve(LEAD_MODULE) as {
        listLeads: (filters: object, config?: object) => Promise<Array<Record<string, unknown>>>
      }).listLeads({}, { take: 200 })
    : []
  const leads = leadRows.filter((lead) => leadIds.includes(String(lead.id)))
  let requests: Array<Record<string, unknown>> = []
  try {
    requests = await (req.scope.resolve(BESPOKE_REQUEST_MODULE) as {
      listBespokeRequests: (filters: object) => Promise<Array<Record<string, unknown>>>
    }).listBespokeRequests({ company_id: id })
  } catch {
    requests = []
  }
  const orderIds: string[] = []
  for (const request of requests) {
    const links = await crm.listRequestOrders({ request_id: String(request.id) })
    for (const link of links) {
      const orderId = text(link.order_id)
      if (orderId) orderIds.push(orderId)
    }
  }
  const followUps = await crm.listFollowUps({ entity_type: "company", entity_id: id })
  const type = text(company.type) as CompanyType | null
  const activity = projectActivity([
    ...requests.map((row) => ({
      id: `req:${row.id}`,
      at: time(row.created_at),
      source: "request" as const,
      text: "Заявка компании",
    })),
    ...followUps.map((row) => ({
      id: `fu:${row.id}`,
      at: time(row.created_at) ?? time(row.due_at),
      source: "follow_up" as const,
      text: text(row.summary) || auditActionText("follow_up_opened"),
    })),
  ])
  res.json({
    company: {
      id: String(company.id),
      name: text(company.name) ?? "Без названия",
      type,
      type_label: type && type in COMPANY_TYPE_LABEL ? COMPANY_TYPE_LABEL[type] : null,
      internal_note: text(company.internal_note),
      created_at: time(company.created_at),
    },
    people: leads.map((lead) => ({
      id: String(lead.id),
      name: text(lead.name),
      email: text(lead.email),
      phone: text(lead.phone),
    })),
    requests: requests.map((row) => ({
      id: String(row.id),
      lead_id: text(row.lead_id),
      status: text(row.status),
      comment: text(row.comment),
      created_at: time(row.created_at),
    })),
    order_ids: [...new Set(orderIds)],
    follow_ups: followUps.map((row) => ({
      id: String(row.id),
      status: text(row.status),
      summary: text(row.summary),
      due_at: time(row.due_at),
    })),
    activity,
  })
}
