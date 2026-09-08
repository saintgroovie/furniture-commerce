import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CatalogPromoPriceListConflictError } from "../../../../lib/woodright-admin/catalog-promo-price-list"

type Handler = (req: MedusaRequest, res: MedusaResponse) => Promise<void>

/**
 * Seller-facing mapping for the one domain error every promo route can hit:
 * a same-title price list that is not a native `sale` list → 409 with a
 * fix-it message instead of a 500.
 */
export function withPromoErrors(handler: Handler): Handler {
  return async (req, res) => {
    try {
      await handler(req, res)
    } catch (error) {
      if (error instanceof CatalogPromoPriceListConflictError) {
        res.status(409).json({
          code: error.code,
          message:
            "Прайс-лист «Промо в каталоге» в Medusa имеет не тот тип - нужен тип «Распродажа» (sale). Переименуйте или удалите его в разделе Price Lists",
          price_list_id: error.priceListId,
        })
        return
      }
      throw error
    }
  }
}
