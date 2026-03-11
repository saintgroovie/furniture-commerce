import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { LEAD_MODULE } from "../../../modules/lead"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const leadService = req.scope.resolve(LEAD_MODULE)
  const list = await leadService.listLeads({}, { order: { created_at: "DESC" } })
  res.json({ leads: list })
}
