import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  loadPromotionSlotResolution,
  toPromotionSlotStorePayload,
} from "../../../../store/woodright/promotion-slot/load-promotion-slot"

/**
 * What the storefront would render right now - same resolution path as the
 * public store route, plus skipped products with reasons.
 * GET /admin/woodright/catalog-promo/preview
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { slot, resolution, productsById } = await loadPromotionSlotResolution(req)
  const payload = toPromotionSlotStorePayload(slot, resolution, productsById)
  res.json({
    active: resolution.active,
    visible: payload.items.length > 0,
    slot: payload.slot,
    items: payload.items.map((item) => ({
      product_id: item.product_id,
      title: (item.product as { title?: unknown }).title ?? null,
      handle: (item.product as { handle?: unknown }).handle ?? null,
      thumbnail: (item.product as { thumbnail?: unknown }).thumbnail ?? null,
      sale_price: item.sale_price,
      original_price: item.original_price,
      discount_percent: item.discount_percent,
    })),
    skipped: resolution.skipped,
  })
}
