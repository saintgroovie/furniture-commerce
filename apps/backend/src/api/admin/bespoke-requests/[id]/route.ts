import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { BESPOKE_REQUEST_MODULE } from "../../../../modules/bespoke-request"
import { BESPOKE_REQUEST_STATUS } from "../../../../modules/bespoke-request/models/bespoke-request"

type BespokeService = {
  retrieveBespokeRequest: (id: string) => Promise<Record<string, unknown> | null>
  updateBespokeRequests: (
    data: Record<string, unknown>
  ) => Promise<Record<string, unknown> | Record<string, unknown>[]>
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id as string
  const bespokeService = req.scope.resolve(BESPOKE_REQUEST_MODULE) as BespokeService
  const bespokeRequest = await bespokeService.retrieveBespokeRequest(id)
  if (!bespokeRequest) {
    res.status(404).json({ message: "Bespoke request not found" })
    return
  }
  res.json({ bespoke_request: bespokeRequest })
}

export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id as string
  const body = req.body as { status?: string; internal_notes?: string; quoted_at?: string }
  if (
    body.status != null &&
    !BESPOKE_REQUEST_STATUS.includes(body.status as (typeof BESPOKE_REQUEST_STATUS)[number])
  ) {
    res.status(400).json({
      message: "Invalid bespoke request status.",
      code: "INVALID_STATUS",
    })
    return
  }
  const bespokeService = req.scope.resolve(BESPOKE_REQUEST_MODULE) as BespokeService
  const hasUpdates =
    body.status != null ||
    body.internal_notes !== undefined ||
    body.quoted_at !== undefined
  const updated = await bespokeService.updateBespokeRequests({
    id,
    ...(body.status != null && { status: body.status }),
    ...(body.internal_notes !== undefined && { internal_notes: body.internal_notes }),
    ...(body.quoted_at !== undefined && {
      quoted_at: body.quoted_at ? new Date(body.quoted_at) : null,
    }),
    ...(hasUpdates && { updated_at: new Date() }),
  })
  const row = Array.isArray(updated) ? updated[0] : updated
  res.json({ bespoke_request: row })
}
