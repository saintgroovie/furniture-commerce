import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { recordCrmAudit } from "../../../../../../lib/woodright-crm/record"
import { requireDeskWrite } from "../../../../../../lib/woodright-workspace/require-desk-write"
import { CRM_MODULE } from "../../../../../../modules/crm"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const gate = await requireDeskWrite(req, res, "crm.edit")
  if (!gate) return
  const leadId = req.params.id as string
  const text = String((req.body as { text?: string } | undefined)?.text ?? "").trim()
  if (!text) {
    res.status(400).json({ message: "Напишите заметку" })
    return
  }
  let service: {
    createPersonNotes: (data: object) => Promise<Record<string, unknown> | Array<Record<string, unknown>>>
  }
  try {
    service = req.scope.resolve(CRM_MODULE)
  } catch {
    res.status(503).json({ code: "crm_unavailable", message: "Заметки ещё не включены в базе" })
    return
  }
  try {
    const created = await service.createPersonNotes({
      lead_id: leadId,
      body: text.slice(0, 2000),
      created_by: gate.actorId,
    })
    const row = Array.isArray(created) ? created[0] : created
    await recordCrmAudit(req, {
      actorId: gate.actorId,
      actorEmail: gate.email,
      entityType: "person",
      entityId: leadId,
      action: "person_note_added",
      after: { note_id: row?.id ? String(row.id) : null },
    })
    res.json({ ok: true, id: row?.id ? String(row.id) : null })
  } catch {
    res.status(503).json({ code: "crm_unavailable", message: "Заметка не сохранилась" })
  }
}
