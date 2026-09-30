import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
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
