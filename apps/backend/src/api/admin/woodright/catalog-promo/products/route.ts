import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { withPromoErrors } from "../with-promo-errors"
import {
  findCatalogPromoPriceList,
  resolvePricingModule,
} from "../../../../../lib/woodright-admin/catalog-promo-price-list"
import {
  buildCatalogPromoAdminProduct,
  CATALOG_PROMO_PRODUCT_GRAPH_FIELDS,
} from "../../../../../lib/woodright-admin/catalog-promo-admin"
import { loadPromoPrices, type QueryGraph } from "../load-catalog-promo-state"

const SEARCH_LIMIT = 12

function normalize(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").trim()
}

/**
 * Product picker for the promo workspace.
 * GET /admin/woodright/catalog-promo/products?q=...
 * Published, non-BESPOKE products with a base RUB price; matches title / sku / handle.
 */
async function getHandler(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const q = normalize(typeof req.query.q === "string" ? req.query.q : "")
  const query = req.scope.resolve("query") as QueryGraph
  const { data } = await query.graph({
    entity: "product",
    fields: [...CATALOG_PROMO_PRODUCT_GRAPH_FIELDS],
    filters: { status: "published" },
  })
  const raws = ((data ?? []) as Array<Record<string, unknown>>).filter((raw) => {
    const type = (raw.product_classification as { product_type?: unknown } | undefined)
      ?.product_type
    if (type === "BESPOKE") return false
    if (!q) return true
    const title = normalize(String(raw.title ?? ""))
    const handle = normalize(String(raw.handle ?? ""))
    const variants = Array.isArray(raw.variants)
      ? (raw.variants as Array<{ sku?: unknown }>)
      : []
    const sku = normalize(String(variants[0]?.sku ?? ""))
    return title.includes(q) || handle.includes(q) || sku.includes(q)
  })
  const limited = raws.slice(0, SEARCH_LIMIT)
  const pricing = resolvePricingModule(req.scope)
  const priceList = await findCatalogPromoPriceList(pricing)
  const promoPrices = await loadPromoPrices(req, priceList, limited)
  const products = limited
    .map((raw) => buildCatalogPromoAdminProduct(raw, promoPrices, priceList))
    .filter((p) => p.base_price != null)
  res.json({ products, total_matches: raws.length })
}

export const GET = withPromoErrors(getHandler)
