import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { recordCrmAudit } from "../../../../../../lib/woodright-crm/record"
import { requireDeskWriteAny } from "../../../../../../lib/woodright-workspace/require-desk-write"
import { PERSON_LINK_MODULE } from "../../../../../../modules/person-link"

type Body = {
  customer_id?: string | null
  assignee_id?: string | null
  unlink?: boolean
}

/**
 * Explicit link or assignee save. Refuses an ambiguous automatic merge:
 * the caller must send one customer id.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const leadId = req.params.id as string
  const body = (req.body ?? {}) as Body
  const touchesCustomer = body.unlink === true || body.customer_id !== undefined
  const touchesAssignee = body.assignee_id !== undefined
  const linkGate = touchesCustomer
    ? await requireDeskWriteAny(req, res, ["people.link", "crm.link_customer"])
    : null
  if (touchesCustomer && !linkGate) return
  const assignGate = touchesAssignee
    ? await requireDeskWriteAny(req, res, ["people.assign", "crm.assign"])
    : null
  if (touchesAssignee && !assignGate) return
  const gate = linkGate ?? assignGate ?? (await requireDeskWriteAny(req, res, ["people.link", "crm.link_customer"]))
  if (!gate) return
  if (Array.isArray((body as { customer_ids?: unknown }).customer_ids)) {
    res.status(400).json({ message: "Несколько совпадений сразу связать нельзя" })
    return
  }
  let service: {
    listPersonLinks: (filters: object) => Promise<Array<Record<string, unknown>>>
    createPersonLinks: (data: object) => Promise<Record<string, unknown> | Array<Record<string, unknown>>>
    updatePersonLinks: (data: object) => Promise<unknown>
  }
  try {
    service = req.scope.resolve(PERSON_LINK_MODULE)
  } catch {
    res.status(503).json({
      code: "person_link_unavailable",
      message: "Связь человека ещё не включена в базе. Миграция не применялась",
    })
    return
  }

  try {
    const existing = await service.listPersonLinks({ lead_id: leadId })
    const current = existing?.[0]
    const beforeCustomer = (current?.customer_id as string | null) ?? null
    const beforeAssignee = (current?.assignee_id as string | null) ?? null
    const customerId = body.unlink ? null : body.customer_id === undefined ? (current?.customer_id as string | null) ?? null : body.customer_id
    const assigneeId = body.assignee_id === undefined ? (current?.assignee_id as string | null) ?? null : body.assignee_id
    const matchStatus = customerId ? "linked" : assigneeId ? "unlinked" : "unlinked"
    if (!current) {
      await service.createPersonLinks({
        lead_id: leadId,
        customer_id: customerId,
        assignee_id: assigneeId,
        match_status: customerId ? "linked" : "unlinked",
      })
    } else {
      await service.updatePersonLinks({
        id: current.id,
        customer_id: customerId,
        assignee_id: assigneeId,
        match_status: matchStatus,
      })
    }
    if (beforeCustomer !== customerId) {
      await recordCrmAudit(req, {
        actorId: gate.actorId,
        actorEmail: gate.email,
        entityType: "person",
        entityId: leadId,
        action: customerId ? "customer_linked" : "customer_unlinked",
        before: { customer_id: beforeCustomer },
        after: { customer_id: customerId },
      })
    }
    if (beforeAssignee !== assigneeId) {
      await recordCrmAudit(req, {
        actorId: gate.actorId,
        actorEmail: gate.email,
        entityType: "person",
        entityId: leadId,
        action: "assignee_set",
        before: { assignee_id: beforeAssignee },
        after: { assignee_id: assigneeId },
      })
    }
    res.json({ ok: true, customer_id: customerId, assignee_id: assigneeId })
  } catch {
    res.status(503).json({
      code: "person_link_unavailable",
      message: "Связь человека ещё не включена в базе. Миграция не применялась",
    })
  }
}
