import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadWillieWinkieMotifProducts } from "../../../lib/load-willie-winkie-motif-products"
import {
  assertBuyerSafeMotifPayload,
  buildMotifContext,
} from "../../../lib/motif-theme"

function queryString(raw: unknown): string | null {
  if (typeof raw === "string") {
    const t = raw.trim()
    return t.length > 0 ? t : null
  }
  if (Array.isArray(raw) && typeof raw[0] === "string") {
    const t = raw[0].trim()
    return t.length > 0 ? t : null
  }
  return null
}

/**
 * PDP motif context: selector options, related-in-motif, fail-closed status.
 * Query motif is never treated as proof of a combination — backend confirms.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const handle = queryString(req.query?.handle)
  if (!handle) {
    res.status(400).json({ message: "handle is required" })
    return
  }
  const motifQuery = queryString(req.query?.motif)
  const products = await loadWillieWinkieMotifProducts(req)
  const motif_context = buildMotifContext({
    products,
    handle,
    motifQuery,
  })
  if (!motif_context) {
    res.status(404).json({ message: "Motif context not available for this product" })
    return
  }
  const payload = { motif_context }
  const leaks = assertBuyerSafeMotifPayload(payload)
  if (leaks.length > 0) {
    res.status(500).json({ message: "Motif context projection leaked internal fields" })
    return
  }
  res.json(payload)
}
