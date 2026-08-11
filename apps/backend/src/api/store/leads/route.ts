import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { LEAD_MODULE } from "../../../modules/lead"
import LeadModuleService from "../../../modules/lead/service"
import {
  checkPublicMutationRateLimit,
  clientKeyFromRequest,
} from "../_lib/public-mutation-rate-limit"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const rl = checkPublicMutationRateLimit({
    key: `leads:${clientKeyFromRequest(req)}`,
    limit: 10,
    windowMs: 60_000,
  })
  res.setHeader("X-RateLimit-Limit", "10")
  res.setHeader("X-RateLimit-Remaining", String(rl.remaining))
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(rl.resetAt / 1000)))
  if (!rl.ok) {
    res.status(429).json({ message: "Too many requests" })
    return
  }

  const body = req.body as {
    source?: string
    name?: string
    email?: string
    phone?: string
    comment?: string
    payload?: Record<string, unknown>
  }
  const leadService = req.scope.resolve(LEAD_MODULE) as LeadModuleService
  const created = await leadService.createLeads({
    source: (body.source as "bespoke" | "room_adapt" | "contact") || "contact",
    name: body.name ?? null,
    email: body.email ?? null,
    phone: body.phone ?? null,
    comment: body.comment ?? null,
    payload: body.payload ?? null,
  })
  const lead = Array.isArray(created) ? created[0] : created
  res.status(201).json({ lead: { id: lead.id } })
}
