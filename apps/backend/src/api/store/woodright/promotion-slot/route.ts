import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  loadPromotionSlotResolution,
  toPromotionSlotStorePayload,
} from "./load-promotion-slot"

/**
 * GET /store/woodright/promotion-slot
 *
 * Catalog Promotion Window payload. Products already filtered server-side
 * (published, non-BESPOKE, purchasable, native sale price active, image).
 * `items: []` means "render the plain catalog" - never an error for the buyer.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { slot, resolution, productsById } = await loadPromotionSlotResolution(req)
  const payload = toPromotionSlotStorePayload(slot, resolution, productsById)
  res.setHeader("x-woodright-promotion-slot", payload.items.length ? "active" : "empty")
  res.json(payload)
}
