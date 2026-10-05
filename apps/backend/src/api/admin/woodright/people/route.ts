import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { collectIdentityCandidates, planDeskPerson } from "../../../../lib/woodright-crm/create-person"
import { requireDeskWrite } from "../../../../lib/woodright-workspace/require-desk-write"
import { BESPOKE_REQUEST_MODULE } from "../../../../modules/bespoke-request"
import { LEAD_MODULE } from "../../../../modules/lead"
import { PERSON_LINK_MODULE } from "../../../../modules/person-link"

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

async function loadLinks(req: MedusaRequest) {
  try {
    const service = req.scope.resolve(PERSON_LINK_MODULE) as {
      listPersonLinks: (filters: object) => Promise<Array<Record<string, unknown>>>
    }
    const rows = await service.listPersonLinks({})
    return { available: true, rows: rows ?? [] }
  } catch {
    return { available: false, rows: [] as Array<Record<string, unknown>> }
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const leads = await (req.scope.resolve(LEAD_MODULE) as {
    listLeads: (filters: object, config?: object) => Promise<Array<Record<string, unknown>>>
  }).listLeads({}, { order: { created_at: "DESC" } })
  const requests = await (req.scope.resolve(BESPOKE_REQUEST_MODULE) as {
    listBespokeRequests: (filters: object) => Promise<Array<Record<string, unknown>>>
  }).listBespokeRequests({})
  const links = await loadLinks(req)
  const byLead = new Map(links.rows.map((row) => [String(row.lead_id), row]))
  const requestCount = new Map<string, number>()
  for (const request of requests ?? []) {
    const leadId = String(request.lead_id ?? "")
    requestCount.set(leadId, (requestCount.get(leadId) ?? 0) + 1)
  }
  const people = (leads ?? []).map((lead) => {
    const link = byLead.get(String(lead.id))
    return {
      id: String(lead.id),
      name: text(lead.name),
      email: text(lead.email),
      phone: text(lead.phone),
      source: text(lead.source),
      request_count: requestCount.get(String(lead.id)) ?? 0,
      customer_id: link ? text(link.customer_id) : null,
      assignee_id: link ? text(link.assignee_id) : null,
      match_status: link ? text(link.match_status) ?? "unlinked" : "unlinked",
    }
  })
  res.json({ people, links_available: links.available })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const gate = await requireDeskWrite(req, res, "crm.edit")
  if (!gate) return
  const body = (req.body ?? {}) as { name?: string; email?: string | null; phone?: string | null; confirm?: boolean }
  const leadService = req.scope.resolve(LEAD_MODULE) as {
    listLeads: (filters: object, config?: object) => Promise<Array<Record<string, unknown>>>
    createLeads: (data: object) => Promise<Record<string, unknown> | Array<Record<string, unknown>>>
  }
  const lookedUp = await collectIdentityCandidates(async (skip, take) => {
    const batch = await leadService.listLeads({}, { take, skip, order: { id: "ASC" } })
    return (batch ?? []).map((lead) => ({
      id: String(lead.id),
      email: text(lead.email),
      phone: text(lead.phone),
    }))
  })
  const plan = planDeskPerson({
    name: body.name ?? "",
    email: body.email,
    phone: body.phone,
    existing: lookedUp.candidates,
    confirm: body.confirm === true,
    lookupComplete: lookedUp.complete,
  })
  if (plan.action === "lookup_incomplete") {
    res.status(409).json({
      code: "lookup_incomplete",
      message: "Людей слишком много, чтобы тихо проверить совпадение. Отметьте, что это другой человек, если уверены",
    })
    return
  }
  if (plan.action === "need_name") {
    res.status(400).json({ message: "Укажите имя" })
    return
  }
  if (plan.action === "confirm_existing") {
    res.status(409).json({
      code: "existing_person",
      ids: plan.ids,
      message: "Похожий человек уже есть",
    })
    return
  }
  const created = await leadService.createLeads({
    source: "contact",
    name: (body.name ?? "").trim().slice(0, 160),
    email: body.email?.trim() || null,
    phone: body.phone?.trim() || null,
    comment: null,
    payload: null,
  })
  const lead = Array.isArray(created) ? created[0] : created
  res.status(201).json({ ok: true, id: lead?.id ? String(lead.id) : null })
}
