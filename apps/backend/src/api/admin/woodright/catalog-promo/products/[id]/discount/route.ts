import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { withPromoErrors } from "../../../with-promo-errors"
import {
  ensureCatalogPromoPriceList,
  findCatalogPromoPriceList,
  removeCatalogPromoPrice,
  resolvePricingModule,
  upsertCatalogPromoPrice,
} from "../../../../../../../lib/woodright-admin/catalog-promo-price-list"
import {
  parsePromoDiscountBody,
  resolveSaleAmount,
} from "../../../../../../../lib/woodright-admin/catalog-promo-admin"
import { loadPromoProductsByIds } from "../../../load-catalog-promo-state"

/**
 * Set the promo sale price for one product (opening variant) through the
 * native "Промо в каталоге" price list.
 * PUT /admin/woodright/catalog-promo/products/:id/discount
 * body: { percent } | { sale_price } | { clear: true }
 */
async function putHandler(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const productId = req.params.id as string
  const parsed = parsePromoDiscountBody(req.body)
  if (!parsed.ok) {
    res.status(400).json({ code: parsed.code, message: parsed.message, field: parsed.field })
    return
  }
  const pricing = resolvePricingModule(req.scope)

  if (parsed.value.mode === "clear") {
    const priceList = await findCatalogPromoPriceList(pricing)
    const [before] = await loadPromoProductsByIds(req, [productId], priceList)
    if (!before) {
      res.status(404).json({ code: "not_found", message: "Товар не найден" })
      return
    }
    if (priceList && before.price_set_id) {
      await removeCatalogPromoPrice(pricing, priceList.id, before.price_set_id)
    }
    const [after] = await loadPromoProductsByIds(req, [productId], priceList)
    res.json({ product: after ?? before, action: "cleared" })
    return
  }

  const { priceList } = await ensureCatalogPromoPriceList(pricing)
  const [current] = await loadPromoProductsByIds(req, [productId], priceList)
  if (!current) {
    res.status(404).json({ code: "not_found", message: "Товар не найден" })
    return
  }
  if (current.base_price == null || !current.price_set_id) {
    res.status(409).json({
      code: "no_base_price",
      message: "У товара нет обычной цены - сначала задайте её",
    })
    return
  }
  const sale = resolveSaleAmount(parsed.value, current.base_price)
  if (!sale.ok) {
    res.status(400).json({ code: sale.code, message: sale.message })
    return
  }
  const result = await upsertCatalogPromoPrice(
    pricing,
    priceList.id,
    current.price_set_id,
    sale.amount as number
  )
  const [after] = await loadPromoProductsByIds(req, [productId], priceList)
  res.json({ product: after ?? current, action: result.action })
}

/**
 * Remove the promo sale price (same as `{ clear: true }`).
 * DELETE /admin/woodright/catalog-promo/products/:id/discount
 */
async function deleteHandler(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  req.body = { clear: true }
  await putHandler(req, res)
}

export const PUT = withPromoErrors(putHandler)
export const DELETE = withPromoErrors(deleteHandler)
