import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { LEAD_MODULE } from "../../../../modules/lead"
import LeadModuleService from "../../../../modules/lead/service"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id as string
  const leadService = req.scope.resolve(LEAD_MODULE) as LeadModuleService
  const lead = await leadService.retrieveLead(id)
  if (!lead) {
    res.status(404).json({ message: "Lead not found" })
    return
  }
  res.json({ lead })
}
