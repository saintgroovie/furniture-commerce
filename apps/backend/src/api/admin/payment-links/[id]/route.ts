import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PAYMENT_LINK_MODULE } from "../../../../modules/payment-link"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id as string
  const paymentLinkService = req.scope.resolve(PAYMENT_LINK_MODULE)
  const paymentLink = await paymentLinkService.retrievePaymentLink(id)
  if (!paymentLink) {
    res.status(404).json({ message: "Payment link not found" })
    return
  }
  res.json({ payment_link: paymentLink })
}

export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id as string
  const body = req.body as { status?: string; url?: string }
  const paymentLinkService = req.scope.resolve(PAYMENT_LINK_MODULE)
  const hasUpdates = body.status != null || body.url !== undefined
  const updated = await paymentLinkService.updatePaymentLinks({
    id,
    ...(body.status != null && { status: body.status }),
    ...(body.url !== undefined && { url: body.url }),
    ...(hasUpdates && { updated_at: new Date() }),
  })
  res.json({ payment_link: updated[0] })
}
