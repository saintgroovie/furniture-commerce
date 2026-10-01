import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { recordCrmAudit } from "../../../../../../lib/woodright-crm/record"
import { queryOf } from "../../../../../../lib/woodright-workspace/load-seller-products"
import { requireDeskWrite } from "../../../../../../lib/woodright-workspace/require-desk-write"
import { BESPOKE_REQUEST_MODULE } from "../../../../../../modules/bespoke-request"
import { CRM_MODULE } from "../../../../../../modules/crm"
import { LEAD_MODULE } from "../../../../../../modules/lead"

type Body = {
  company_id?: string | null
  counterparty_lead_id?: string | null
  order_id?: string | null
  unlink_order_id?: string | null
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const gate = await requireDeskWrite(req, res, "crm.edit")
  if (!gate) return
  const requestId = req.params.id as string
  const body = (req.body ?? {}) as Body
  const bespoke = req.scope.resolve(BESPOKE_REQUEST_MODULE) as {
    retrieveBespokeRequest: (id: string) => Promise<Record<string, unknown> | null>
    updateBespokeRequests: (data: object) => Promise<unknown>
  }
  const current = await bespoke.retrieveBespokeRequest(requestId)
  if (!current) {
    res.status(404).json({ message: "Заявка не найдена" })
    return
  }
  let crm: {
    retrieveCompany: (id: string) => Promise<Record<string, unknown> | null>
    listRequestOrders: (filters: object) => Promise<Array<Record<string, unknown>>>
    createRequestOrders: (data: object) => Promise<unknown>
    deleteRequestOrders: (ids: string[]) => Promise<unknown>
  } | null = null
  if (body.company_id || body.order_id || body.unlink_order_id) {
    try {
      crm = req.scope.resolve(CRM_MODULE)
    } catch {
      res.status(503).json({ code: "crm_unavailable", message: "Связи CRM ещё не включены в базе" })
      return
    }
  }
  if (body.company_id) {
    let company: Record<string, unknown> | null = null
    try {
      company = await crm!.retrieveCompany(body.company_id)
    } catch {
      company = null
    }
    if (!company) {
      res.status(400).json({ message: "Компания не найдена" })
      return
    }
  }
  if (body.counterparty_lead_id) {
    let lead: Record<string, unknown> | null = null
    try {
      lead = await (req.scope.resolve(LEAD_MODULE) as {
        retrieveLead: (id: string) => Promise<Record<string, unknown> | null>
      }).retrieveLead(body.counterparty_lead_id)
    } catch {
      lead = null
    }
    if (!lead) {
      res.status(400).json({ message: "Второй человек не найден" })
      return
    }
  }
  if (body.order_id) {
    const found = await queryOf(req).graph({
      entity: "order",
      fields: ["id"],
      filters: { id: body.order_id },
      pagination: { take: 1, skip: 0 },
    })
    const rows = (found.data ?? []) as Array<unknown>
    if (rows.length === 0) {
      res.status(400).json({ message: "Заказ не найден" })
      return
    }
  }

  const patch: Record<string, unknown> = { id: requestId }
  if (body.company_id !== undefined) patch.company_id = body.company_id || null
  if (body.counterparty_lead_id !== undefined) patch.counterparty_lead_id = body.counterparty_lead_id || null
  if (Object.keys(patch).length > 1) {
    await bespoke.updateBespokeRequests(patch)
    await recordCrmAudit(req, {
      actorId: gate.actorId,
      actorEmail: null,
      entityType: "request",
      entityId: requestId,
      action: "request_updated",
      after: {
        company_id: body.company_id === undefined ? undefined : body.company_id || null,
        counterparty_lead_id: body.counterparty_lead_id === undefined ? undefined : body.counterparty_lead_id || null,
      },
    })
  }
  if (crm && body.unlink_order_id) {
    const rows = await crm.listRequestOrders({ request_id: requestId, order_id: body.unlink_order_id })
    if (rows[0]) await crm.deleteRequestOrders([String(rows[0].id)])
  }
  if (crm && body.order_id) {
    const rows = await crm.listRequestOrders({ request_id: requestId, order_id: body.order_id })
    if (!rows[0]) await crm.createRequestOrders({ request_id: requestId, order_id: body.order_id })
  }
  res.json({ ok: true })
}
