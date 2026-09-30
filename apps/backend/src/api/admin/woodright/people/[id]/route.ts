import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { BESPOKE_REQUEST_MODULE } from "../../../../../modules/bespoke-request"
import { LEAD_MODULE } from "../../../../../modules/lead"
import { PERSON_LINK_MODULE } from "../../../../../modules/person-link"
import { matchCandidates, normalizeEmail } from "../../../../../lib/woodright-workspace/identity"
import { queryOf } from "../../../../../lib/woodright-workspace/load-seller-products"

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null
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
  try {
    const query = queryOf(req)
    const byEmail = email
      ? await query.graph({
          entity: "customer",
          fields: ["id", "email", "phone", "first_name", "last_name"],
          filters: { email: normalizeEmail(email) ?? email },
          pagination: { take: 5 },
        })
      : { data: [] }
    customers = ((byEmail.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      email: text(row.email),
      phone: text(row.phone),
    }))
  } catch {
    customers = []
  }
  const suggestion = matchCandidates(customers, { email, phone })

  let orders: Array<Record<string, unknown>> = []
  const customerId = link ? text(link.customer_id) : null
  if (customerId) {
    try {
      const query = queryOf(req)
      const result = await query.graph({
        entity: "order",
        fields: ["id", "display_id", "created_at", "total", "currency_code", "payment_status"],
        filters: { customer_id: customerId },
        pagination: { take: 20 },
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
    link: link
      ? {
          customer_id: text(link.customer_id),
          assignee_id: text(link.assignee_id),
          match_status: text(link.match_status) ?? "unlinked",
        }
      : null,
    links_available: linksAvailable,
    suggestion:
      suggestion.status === "needs_review"
        ? { status: "needs_review", customer_ids: suggestion.ids }
        : suggestion.status === "linked"
          ? { status: "candidate", customer_ids: suggestion.ids }
          : { status: "none", customer_ids: [] },
    staff,
  })
}
