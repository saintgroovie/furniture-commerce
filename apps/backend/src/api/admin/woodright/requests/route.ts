import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireDeskWrite } from "../../../../lib/woodright-workspace/require-desk-write"
import { BESPOKE_REQUEST_MODULE } from "../../../../modules/bespoke-request"
import { LEAD_MODULE } from "../../../../modules/lead"

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

/** A request always belongs to an existing person. It does not create a store customer. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const gate = await requireDeskWrite(req, res, "crm.edit")
  if (!gate) return
  const body = (req.body ?? {}) as { lead_id?: string; comment?: string }
  const leadId = body.lead_id?.trim() ?? ""
  const comment = body.comment?.trim() ?? ""
  if (!leadId) {
    res.status(400).json({ message: "Выберите человека" })
    return
  }
  if (!comment) {
    res.status(400).json({ message: "Напишите, о чём обращение" })
    return
  }
  const leads = await (req.scope.resolve(LEAD_MODULE) as {
    listLeads: (filters: object, config?: object) => Promise<Array<Record<string, unknown>>>
  }).listLeads({ id: leadId }, { take: 1 })
  if (!leads?.some((lead) => text(lead.id) === leadId || String(lead.id) === leadId)) {
    res.status(400).json({ message: "Человек не найден" })
    return
  }
  const created = await (req.scope.resolve(BESPOKE_REQUEST_MODULE) as {
    createBespokeRequests: (data: object) => Promise<Record<string, unknown> | Array<Record<string, unknown>>>
  }).createBespokeRequests({
    lead_id: leadId,
    comment: comment.slice(0, 2000),
    status: "new",
  })
  const row = Array.isArray(created) ? created[0] : created
  res.status(201).json({ ok: true, id: row?.id ? String(row.id) : null })
}
