import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PAYMENT_LINK_MODULE } from "../../../modules/payment-link"
import PaymentLinkModuleService from "../../../modules/payment-link/service"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const paymentLinkService = req.scope.resolve(
    PAYMENT_LINK_MODULE
  ) as PaymentLinkModuleService
  const list = await paymentLinkService.listPaymentLinks({}, { order: { created_at: "DESC" } })
  res.json({ payment_links: list })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as {
    entity_type: "order" | "lead"
    entity_id: string
    amount: number
    currency_code: string
    url: string
    purpose?: string
    expires_at?: string
  }
  if (!body.entity_type || !body.entity_id || body.amount == null || !body.currency_code || !body.url) {
    res.status(400).json({ message: "entity_type, entity_id, amount, currency_code, url are required" })
    return
  }
  const paymentLinkService = req.scope.resolve(
    PAYMENT_LINK_MODULE
  ) as PaymentLinkModuleService
  const created = await paymentLinkService.createPaymentLinks({
    entity_type: body.entity_type,
    entity_id: body.entity_id,
    amount: body.amount,
    currency_code: body.currency_code,
    url: body.url,
    purpose: body.purpose ?? null,
    expires_at: body.expires_at ? new Date(body.expires_at) : null,
  })
  const paymentLink = Array.isArray(created) ? created[0] : created
  res.status(201).json({ payment_link: paymentLink })
}
