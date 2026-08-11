import { getCatalogProducts } from "@/lib/api/products"
import {
  isMedusaCanonicalSeedDemoProduct,
  isProductInActiveCatalogScope,
} from "@/lib/catalog-scope"

export const BESPOKE_PRODUCT_TYPE = "BESPOKE"

/**
 * Resolves bespoke products — products with ProductClassification.product_type = "BESPOKE".
 *
 * Pure content-layer filter for /bespoke/catalog display.
 * Does NOT change any business logic or cart rules —
 * those are enforced by backend middleware.
 *
 * Uses lean `/store/catalog-products` (same classification field as fat list)
 * to avoid ~1.4MB `/store/products` browse payload on this route.
 */
export async function resolveBespokeProducts(): Promise<{
  ids: Set<string>
  products: Array<Record<string, unknown>>
}> {
  const data = await getCatalogProducts()
  const all = (data.products ?? []) as Array<Record<string, unknown>>

  const ids = new Set<string>()
  const products: Array<Record<string, unknown>> = []

  for (const p of all) {
    const classification = p.product_classification as
      | { product_type?: string }
      | undefined
    if (classification?.product_type === BESPOKE_PRODUCT_TYPE) {
      if (isMedusaCanonicalSeedDemoProduct(p)) continue
      if (!isProductInActiveCatalogScope(p)) continue
      const pid = p.id as string | undefined
      if (pid && !ids.has(pid)) {
        ids.add(pid)
        products.push(p)
      }
    }
  }

  return { ids, products }
}
