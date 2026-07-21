import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadWillieWinkieMotifProducts } from "../../../../lib/load-willie-winkie-motif-products"
import {
  assertBuyerSafeMotifPayload,
  buildMotifThemeDetail,
} from "../../../../lib/motif-theme"

/**
 * Buyer-safe Willie Winkie motif detail (products in one design theme).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const slug = String(req.params.slug ?? "").trim()
  if (!slug) {
    res.status(404).json({ message: "Motif theme not found" })
    return
  }
  const products = await loadWillieWinkieMotifProducts(req)
  const motif_theme = buildMotifThemeDetail(products, slug)
  if (!motif_theme) {
    res.status(404).json({ message: "Motif theme not found" })
    return
  }
  const payload = { motif_theme }
  const leaks = assertBuyerSafeMotifPayload(payload)
  if (leaks.length > 0) {
    res.status(500).json({ message: "Motif theme projection leaked internal fields" })
    return
  }
  res.json(payload)
}
