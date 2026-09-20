/**
 * Catalog browse pool for RSC HTML budget.
 *
 * CatalogBrowseClient must not receive the full scoped list (~111 products):
 * Next serializes client props into `__next_f.push` and that flight is the
 * bulk of `/catalog` HTML. SSR ships ATF representatives only; the browser
 * loads `/store/catalog-products` and re-scopes with the same membership ids.
 */

import { CATALOG_ATF_EAGER_COUNT } from "./catalog-atf"
import {
  applyCatalogFilters,
  sortDisplayEntries,
  type CatalogFilterState,
} from "./catalog-filters"
import { groupProductsForDisplay } from "./display-group"
import {
  isMedusaCanonicalSeedDemoProduct,
  isProductInActiveCatalogScope,
  isProductInMainCatalogScope,
} from "./catalog-scope"

export type CatalogBrowsePoolScope = "main" | "kids"

export function scopeCatalogBrowsePool(
  products: Array<Record<string, unknown>>,
  scope: CatalogBrowsePoolScope,
  kidsProductIds: ReadonlyArray<string>
): Array<Record<string, unknown>> {
  const kids = new Set(kidsProductIds)
  if (scope === "kids") {
    return products.filter(
      (p) => kids.has(String(p.id ?? "")) && isProductInActiveCatalogScope(p)
    )
  }
  return products.filter((p) => {
    if (kids.has(String(p.id ?? ""))) return false
    if (!isProductInMainCatalogScope(p)) return false
    if (isMedusaCanonicalSeedDemoProduct(p)) return false
    const classification = (
      p.product_classification as { product_type?: string } | undefined
    )?.product_type
    return classification !== "BESPOKE"
  })
}

export function catalogBrowseDisplayEntries(
  products: Array<Record<string, unknown>>,
  filterState: CatalogFilterState
) {
  const filtered = applyCatalogFilters(products, filterState)
  return sortDisplayEntries(
    groupProductsForDisplay(filtered),
    filterState.sort
  )
}

/**
 * Representatives of the first ATF catalog cards (not full display groups).
 * Group chips / min-price complete after the client pool fetch.
 */
export function collectAtfBrowseProducts(
  products: Array<Record<string, unknown>>,
  filterState: CatalogFilterState,
  limit = CATALOG_ATF_EAGER_COUNT
): Array<Record<string, unknown>> {
  const entries = catalogBrowseDisplayEntries(products, filterState)
  const byId = new Map(
    products.map((p) => [String(p.id ?? ""), p] as const)
  )
  const out: Array<Record<string, unknown>> = []
  const seen = new Set<string>()
  for (const entry of entries.slice(0, limit)) {
    const id = String((entry.product as { id?: unknown }).id ?? "")
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(byId.get(id) ?? (entry.product as Record<string, unknown>))
  }
  return out
}

export function catalogItemListJsonLdPayload(
  siteUrl: string,
  entries: Array<{ product: Record<string, unknown> }>
): Record<string, unknown> | null {
  if (!siteUrl || entries.length === 0) return null
  const base = siteUrl.replace(/\/$/, "")
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: entries.length,
    itemListElement: entries.map((entry, i) => {
      const product = entry.product
      return {
        "@type": "ListItem",
        position: i + 1,
        url: `${base}/product/${String((product as { id?: unknown }).id ?? "")}`,
        name:
          typeof (product as { title?: unknown }).title === "string"
            ? (product as { title: string }).title
            : undefined,
      }
    }),
  }
}

/** Throws if the browse projection JSON is missing a `products` array. */
export function parseStoreCatalogProductsPayload(
  data: unknown
): Array<Record<string, unknown>> {
  if (!data || typeof data !== "object") {
    throw new Error("catalog-products: malformed")
  }
  const products = (data as { products?: unknown }).products
  if (!Array.isArray(products)) {
    throw new Error("catalog-products: malformed")
  }
  return products as Array<Record<string, unknown>>
}
