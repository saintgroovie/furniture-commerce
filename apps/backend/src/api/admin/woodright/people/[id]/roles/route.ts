import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { isPersonRole } from "../../../../../../lib/woodright-crm/constants"
import { recordCrmAudit } from "../../../../../../lib/woodright-crm/record"
import { requireDeskWrite } from "../../../../../../lib/woodright-workspace/require-desk-write"
import { CRM_MODULE } from "../../../../../../modules/crm"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const gate = await requireDeskWrite(req, res, "crm.edit")
  if (!gate) return
  const leadId = req.params.id as string
  const body = (req.body ?? {}) as { role?: string; remove?: boolean }
  const role = body.role ?? ""
  if (!isPersonRole(role)) {
    res.status(400).json({ message: "Такой роли нет" })
    return
  }
  let service: {
    listPersonRoleRows: (filters: object) => Promise<Array<Record<string, unknown>>>
    createPersonRoleRows: (data: object) => Promise<unknown>
    deletePersonRoleRows: (ids: string[]) => Promise<unknown>
  }
  try {
    service = req.scope.resolve(CRM_MODULE)
  } catch {
    res.status(503).json({ code: "crm_unavailable", message: "Роли ещё не включены в базе" })
    return
  }
  try {
    const existing = await service.listPersonRoleRows({ lead_id: leadId, role })
    const current = existing?.[0]
    if (body.remove) {
      if (current) await service.deletePersonRoleRows([String(current.id)])
      await recordCrmAudit(req, {
        actorId: gate.actorId,
        actorEmail: gate.email,
        entityType: "person",
        entityId: leadId,
        action: "role_removed",
        after: { role },
      })
      res.json({ ok: true, role, removed: true })
      return
    }
    if (!current) {
      await service.createPersonRoleRows({ lead_id: leadId, role })
      await recordCrmAudit(req, {
        actorId: gate.actorId,
        actorEmail: gate.email,
        entityType: "person",
        entityId: leadId,
        action: "role_added",
        after: { role },
      })
    }
    res.json({ ok: true, role, removed: false })
  } catch {
    res.status(503).json({ code: "crm_unavailable", message: "Роль не сохранилась" })
  }
}
