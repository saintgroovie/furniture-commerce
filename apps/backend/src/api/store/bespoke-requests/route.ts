import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { BESPOKE_REQUEST_MODULE } from "../../../modules/bespoke-request"

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
  const bespokeService = req.scope.resolve(BESPOKE_REQUEST_MODULE) as any
  const [request] = await bespokeService.createBespokeRequests({
    lead_id: body.lead_id,
    product_id: body.product_id ?? null,
    room_set_id: body.room_set_id ?? null,
    dimensions: body.dimensions ?? null,
    materials: body.materials ?? null,
    budget: body.budget ?? null,
    comment: body.comment ?? null,
  })
  res.status(201).json({ bespoke_request: { id: request.id } })
}
