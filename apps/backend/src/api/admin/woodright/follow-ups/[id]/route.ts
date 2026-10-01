import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { isFollowUpStatus } from "../../../../../lib/woodright-crm/constants"
import { recordCrmAudit } from "../../../../../lib/woodright-crm/record"
import { requireDeskWrite } from "../../../../../lib/woodright-workspace/require-desk-write"
import { CRM_MODULE } from "../../../../../modules/crm"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const gate = await requireDeskWrite(req, res, "crm.follow_up")
  if (!gate) return
  const id = req.params.id as string
  const status = String((req.body as { status?: string } | undefined)?.status ?? "")
  if (!isFollowUpStatus(status)) {
    res.status(400).json({ message: "Неизвестный статус напоминания" })
    return
  }
  let service: {
    updateFollowUps: (data: object) => Promise<unknown>
  }
  try {
    service = req.scope.resolve(CRM_MODULE)
  } catch {
    res.status(503).json({ code: "crm_unavailable", message: "Напоминания ещё не включены в базе" })
    return
  }
  try {
    await service.updateFollowUps({ id, status })
    await recordCrmAudit(req, {
      actorId: gate.actorId,
      actorEmail: gate.email,
      entityType: "follow_up",
      entityId: id,
      action: "follow_up_updated",
      after: { status },
    })
    res.json({ ok: true, id, status })
  } catch {
    res.status(503).json({ code: "crm_unavailable", message: "Напоминание не обновилось" })
  }
}
