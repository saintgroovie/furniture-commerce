import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  loadSellerProductById,
  type QueryGraph,
} from "../../../../../lib/woodright-admin/seller-product"
import { resolveWoodrightSiteUrl } from "../../../../../lib/woodright-admin/site-preview-url"
import {
  findCatalogPromoPriceList,
  listCatalogPromoPrices,
  resolvePricingModule,
} from "../../../../../lib/woodright-admin/catalog-promo-price-list"
import { attachPromoPrices } from "../../../../../lib/woodright-admin/seller-product-promo"

/**
 * Single seller product for the Workspace editor.
 * GET /admin/woodright/products/:id
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id as string
  const query = req.scope.resolve("query") as QueryGraph
  // Same canonical promo list the write path uses, so the editor shows the row it edits.
  // A lookup failure is reported separately: «не удалось загрузить» is not «акции нет».
  const pricing = resolvePricingModule(req.scope)
  let promoPriceListId: string | null = null
  let promoPriceAvailable = true
  try {
    const promoList = await findCatalogPromoPriceList(pricing)
    promoPriceListId = promoList?.id ?? null
  } catch {
    promoPriceAvailable = false
  }
  let product = await loadSellerProductById(query, id, { promoPriceListId })
  if (!product) {
    res.status(404).json({ code: "not_found", message: "Товар не найден" })
    return
  }
  if (promoPriceListId) {
    try {
      const priceSetIds = product.variants.map((variant) => variant.price_set_id).filter((value): value is string => Boolean(value))
      const rows = priceSetIds.length > 0 ? await listCatalogPromoPrices(pricing, promoPriceListId, priceSetIds) : new Map()
      product = attachPromoPrices(product, rows, promoPriceListId)
    } catch {
      promoPriceAvailable = false
    }
  }
  res.json({
    product,
    site_url: resolveWoodrightSiteUrl(),
    promo_price_available: promoPriceAvailable,
  })
}
