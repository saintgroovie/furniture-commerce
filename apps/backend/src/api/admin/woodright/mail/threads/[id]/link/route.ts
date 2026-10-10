import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireDeskWrite } from "../../../../../../../lib/woodright-workspace/require-desk-write"
import { COMMUNICATION_MODULE } from "../../../../../../../modules/communication"

/**
 * Explicit relationship only. Never merges two people and never creates a customer.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const gate = await requireDeskWrite(req, res, "mail.assign")
  if (!gate) return
  const id = req.params.id as string
  const body = (req.body ?? {}) as { lead_id?: string; unlink?: boolean }
  const leadId = body.unlink === true ? null : typeof body.lead_id === "string" && /^[A-Za-z0-9]+$/.test(body.lead_id) ? body.lead_id : undefined
  if (leadId === undefined) {
    res.status(400).json({ message: "Нужен один человек" })
    return
  }
  try {
    await (req.scope.resolve(COMMUNICATION_MODULE) as {
      updateCommThreads: (data: object) => Promise<unknown>
    }).updateCommThreads({ id, lead_id: leadId })
    res.json({ ok: true, lead_id: leadId })
  } catch {
    res.status(503).json({ message: "Почта временно недоступна" })
  }
}
