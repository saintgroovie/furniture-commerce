import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadWillieWinkieMotifProducts } from "../../../lib/load-willie-winkie-motif-products"
import {
  assertBuyerSafeMotifPayload,
  buildMotifThemes,
} from "../../../lib/motif-theme"

/**
 * Buyer-safe Willie Winkie motif directory.
 * Aggregates only SKU-confirmed published products (no family×motif grid).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const products = await loadWillieWinkieMotifProducts(req)
  const motif_themes = buildMotifThemes(products)
  const payload = { motif_themes }
  const leaks = assertBuyerSafeMotifPayload(payload)
  if (leaks.length > 0) {
    res.status(500).json({ message: "Motif theme projection leaked internal fields" })
    return
  }
  res.json(payload)
}
