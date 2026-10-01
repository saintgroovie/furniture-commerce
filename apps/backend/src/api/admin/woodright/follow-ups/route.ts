import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { isFollowUpEntity } from "../../../../lib/woodright-crm/constants"
import { dueInstant, dueOnFromPreset, type FollowUpPreset } from "../../../../lib/woodright-crm/follow-up"
import { recordCrmAudit } from "../../../../lib/woodright-crm/record"
import { requireDeskWrite } from "../../../../lib/woodright-workspace/require-desk-write"
import { CRM_MODULE } from "../../../../modules/crm"

type Body = {
  entity_type?: string
  entity_id?: string
  preset?: string
  due_on?: string
  text?: string
  assignee_id?: string | null
}

const PRESETS = new Set(["today", "tomorrow", "in_3_days"])

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const gate = await requireDeskWrite(req, res, "crm.follow_up")
  if (!gate) return
  const body = (req.body ?? {}) as Body
  const entityType = body.entity_type ?? ""
  const entityId = (body.entity_id ?? "").trim()
  if (!isFollowUpEntity(entityType) || !entityId) {
    res.status(400).json({ message: "Укажите, к чему относится напоминание" })
    return
  }
  const dueOn = body.due_on?.trim()
    ? body.due_on.trim()
    : body.preset && PRESETS.has(body.preset)
      ? dueOnFromPreset(body.preset as FollowUpPreset, new Date())
      : null
  const dueAt = dueOn ? dueInstant(dueOn) : null
  if (!dueAt) {
    res.status(400).json({ message: "Укажите дату напоминания" })
    return
  }
  const summary = (body.text ?? "").trim().slice(0, 280) || "Напоминание"
  let service: {
    createFollowUps: (data: object) => Promise<Record<string, unknown> | Array<Record<string, unknown>>>
  }
  try {
    service = req.scope.resolve(CRM_MODULE)
  } catch {
    res.status(503).json({ code: "crm_unavailable", message: "Напоминания ещё не включены в базе" })
    return
  }
  try {
    const created = await service.createFollowUps({
      entity_type: entityType,
      entity_id: entityId,
      assignee_id: body.assignee_id ?? gate.actorId,
      due_at: new Date(dueAt),
      summary,
      status: "open",
      created_by: gate.actorId,
    })
    const row = Array.isArray(created) ? created[0] : created
    const auditRecorded = await recordCrmAudit(req, {
      actorId: gate.actorId,
      actorEmail: null,
      entityType: entityType === "person" ? "person" : entityType,
      entityId,
      action: "follow_up_opened",
      after: { follow_up_id: row?.id ? String(row.id) : null, status: "open", entity_type: entityType },
    })
    res.json({ ok: true, id: row?.id ? String(row.id) : null, due_at: dueAt, audit_recorded: auditRecorded })
  } catch {
    res.status(503).json({ code: "crm_unavailable", message: "Напоминания ещё не включены в базе" })
  }
}
