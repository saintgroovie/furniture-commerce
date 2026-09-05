import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { BESPOKE_REQUEST_MODULE } from "../../../modules/bespoke-request"
import BespokeRequestModuleService from "../../../modules/bespoke-request/service"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as {
    lead_id: string
    product_id?: string
    room_set_id?: string
    dimensions?: string
    materials?: string
    budget?: string
    comment?: string
  }
  if (!body.lead_id) {
    res.status(400).json({ message: "lead_id is required" })
    return
  }
  const bespokeService = req.scope.resolve(
    BESPOKE_REQUEST_MODULE
  ) as BespokeRequestModuleService
  const created = await bespokeService.createBespokeRequests({
    lead_id: body.lead_id,
    product_id: body.product_id ?? null,
    room_set_id: body.room_set_id ?? null,
    dimensions: body.dimensions ?? null,
    materials: body.materials ?? null,
    budget: body.budget ?? null,
    comment: body.comment ?? null,
  })
  const request = Array.isArray(created) ? created[0] : created
  res.status(201).json({ bespoke_request: { id: request.id } })
}
