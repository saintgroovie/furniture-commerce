import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  findCatalogPromoPriceList,
  promoSaleAmount,
  removeCatalogPromoPrice,
  resolvePricingModule,
  upsertCatalogPromoPrice,
} from "../../../../../../lib/woodright-admin/catalog-promo-price-list"
import { loadSellerProductById, type QueryGraph } from "../../../../../../lib/woodright-admin/seller-product"
import { requireDeskWrite } from "../../../../../../lib/woodright-workspace/require-desk-write"

async function priceSetId(query: QueryGraph, variantId: string): Promise<string | null> {
  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id", "price_set.id"],
    filters: { id: variantId },
  })
  const row = data?.[0] as { price_set?: { id?: string } | null } | undefined
  return row?.price_set?.id ?? null
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const gate = await requireDeskWrite(req, res, "catalog.price")
  if (!gate) return
  const id = req.params.id as string
  const body = (req.body ?? {}) as {
    variant_id?: unknown
    amount?: unknown
    percent?: unknown
    remove?: unknown
  }
  if (typeof body.variant_id !== "string" || !body.variant_id) {
    res.status(400).json({ message: "Выберите вариант" })
    return
  }
  const query = req.scope.resolve("query") as QueryGraph
  const product = await loadSellerProductById(query, id)
  const variant = product?.variants.find((item) => item.id === body.variant_id)
  const base = variant?.rub_price?.amount ?? null
  if (!product || !variant || !base) {
    res.status(404).json({ message: "Нет обычной цены, от которой считать акцию" })
    return
  }
  const pricing = resolvePricingModule(req.scope)
  const list = await findCatalogPromoPriceList(pricing)
  if (!list) {
    res.status(409).json({ message: "Прайс-лист акции ещё не создан" })
    return
  }
  const setId = await priceSetId(query, variant.id)
  if (!setId) {
    res.status(409).json({ message: "У варианта нет набора цен" })
    return
  }
  if (body.remove === true) {
    const removed = await removeCatalogPromoPrice(pricing, list.id, setId)
    const after = await loadSellerProductById(query, id)
    res.json({ product: after, removed: removed.removed, price_list_id: list.id })
    return
  }
  const amount = promoSaleAmount({ amount: body.amount, percent: body.percent, base })
  if (amount == null) {
    res.status(400).json({ message: "Акционная цена должна быть целым числом рублей и меньше обычной" })
    return
  }
  const result = await upsertCatalogPromoPrice(pricing, list.id, setId, amount)
  res.json({
    product: await loadSellerProductById(query, id),
    promo: result,
    base_amount: base,
    price_list_id: list.id,
  })
}
