import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { BESPOKE_REQUEST_MODULE } from "../../../modules/bespoke-request"
import BespokeRequestModuleService from "../../../modules/bespoke-request/service"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const status = req.query.status as string | undefined
  const bespokeService = req.scope.resolve(
    BESPOKE_REQUEST_MODULE
  ) as BespokeRequestModuleService
  const filters = status ? { status } : {}
  const list = await bespokeService.listBespokeRequests(filters, { order: { created_at: "DESC" } })
  res.json({ bespoke_requests: list })
}
