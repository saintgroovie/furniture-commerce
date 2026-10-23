import { getCatalogProductsForHandles } from "@/lib/api/products"
import { isBuyerPublicProductStatus } from "@/lib/buyer-publication"
import { isProductInActiveCatalogScope, isMedusaCanonicalSeedDemoProduct } from "@/lib/catalog-scope"
import { isRequestQuoteProduct } from "@/lib/request-quote"
import { BESPOKE_PRODUCT_TYPE } from "@/lib/bespoke"
import { toHomeProduct } from "@/components/home/home-data"
import type { EditorialProduct } from "./editorial-scenes"

/** Use the existing catalog price/title projection; never keep prototype prices. */
export function resolveEditorialProducts(
  rows: Record<string, unknown>[], handles: readonly string[]
): Record<string, EditorialProduct> {
  const result: Record<string, EditorialProduct> = {}
  for (const handle of new Set(handles)) {
    const matches = rows.filter((p) => p.handle === handle && isBuyerPublicProductStatus(p.status))
    // An ambiguous identity must not turn a photograph into a different sale.
    if (matches.length !== 1) continue
    const row = matches[0]!
    if (!isProductInActiveCatalogScope(row) || isMedusaCanonicalSeedDemoProduct(row)) continue
    const product = toHomeProduct(row)
    if (!product) continue
    const classification = (row.product_classification ?? row.custom_product_type) as { product_type?: string } | undefined
    const requestQuote = isRequestQuoteProduct(row) || classification?.product_type === BESPOKE_PRODUCT_TYPE
    result[handle] = {
      handle, title: product.title, href: product.href, priceLabel: product.priceLabel,
      actionLabel: requestQuote
        ? "Обсудить проект"
        : product.priceLabel ? "Выбрать и купить" : "Смотреть товар",
    }
  }
  return result
}

export async function getEditorialProducts(handles: readonly string[]): Promise<Record<string, EditorialProduct>> {
  if (!handles.length) return {}
  try {
    const { products } = await getCatalogProductsForHandles([...handles])
    return resolveEditorialProducts(products, handles)
  } catch {
    // Keep the editorial photos and catalog navigation available during an API error.
    return {}
  }
}
