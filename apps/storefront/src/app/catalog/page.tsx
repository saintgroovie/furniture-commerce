import Link from "next/link"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { ProductCard } from "@/components/product-card"
import {
  CatalogFilterControls,
} from "@/components/catalog-filter-controls"
import { getSiteUrl } from "@/lib/api/base"
import { getProducts } from "@/lib/api/products"
import { resolveKidsProducts } from "@/lib/kids"
import { BESPOKE_PRODUCT_TYPE } from "@/lib/bespoke"
import { groupProductsForDisplay } from "@/lib/display-group"
import {
  isMedusaCanonicalSeedDemoProduct,
  isProductInMainCatalogScope,
} from "@/lib/catalog-scope"
import {
  catalogLegacyTypeRedirectQuery,
  parseCatalogFilterState,
} from "@/lib/catalog-filter-params"
import {
  applyCatalogFilters,
  buildCatalogFacets,
  sortDisplayEntries,
} from "@/lib/catalog-filters"

export const metadata: Metadata = {
  title: "Каталог",
  description: "Каталог мебели Woodright. Готовые товары и товары с вариациями.",
  openGraph: {
    title: "Каталог мебели | Woodright",
    description: "Каталог мебели Woodright. Готовые товары и товары с вариациями.",
    url: "/catalog",
  },
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const legacyQs = catalogLegacyTypeRedirectQuery(searchParams)
  if (legacyQs) redirect(`/catalog?${legacyQs}`)

  const filterState = parseCatalogFilterState(searchParams)

  let data: { products?: unknown[] } = {}
  try {
    data = await getProducts()
  } catch {
    return (
      <div data-state="error">
        <h1>Каталог</h1>
        <p className="info-text" style={{ marginTop: "0.5rem" }}>Не удалось загрузить каталог.</p>
        <div className="nav-links" style={{ marginTop: "1rem" }}>
          <Link href="/">На главную</Link>
        </div>
      </div>
    )
  }
  const products = data.products ?? []
  const allRaw = Array.isArray(products) ? products : []

  let kidsIds: Set<string>
  try {
    kidsIds = (
      await resolveKidsProducts({
        storeProducts: allRaw as Record<string, unknown>[],
      })
    ).ids
  } catch {
    kidsIds = new Set()
  }
  const scoped = allRaw.filter(
    (p: Record<string, unknown>) =>
      !kidsIds.has(p.id as string) &&
      (p.product_classification as { product_type?: string } | undefined)
        ?.product_type !== BESPOKE_PRODUCT_TYPE &&
      isProductInMainCatalogScope(p) &&
      !isMedusaCanonicalSeedDemoProduct(p)
  ) as Record<string, unknown>[]

  const filtered = applyCatalogFilters(scoped, filterState)
  const facets = {
    types: buildCatalogFacets(scoped, filterState, "type").types,
    categories: buildCatalogFacets(scoped, filterState, "category").categories,
    collections: buildCatalogFacets(scoped, filterState, "collection").collections,
    priceRange: buildCatalogFacets(scoped, filterState, "price").priceRange,
  }

  const displayEntries = sortDisplayEntries(
    groupProductsForDisplay(filtered),
    filterState.sort
  )

  const base = getSiteUrl()
  const itemListJsonLd = displayEntries.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: displayEntries.length,
    itemListElement: displayEntries.map((entry, i: number) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${base}/product/${(entry.product as Record<string, unknown>).id}`,
      name: ((entry.product as Record<string, unknown>).title as string) ?? undefined,
    })),
  } : null

  return (
    <div data-state={displayEntries.length === 0 ? "empty" : "success"}>
      {itemListJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
        />
      )}

      <h1>Каталог</h1>

      <CatalogFilterControls
        basePath="/catalog"
        state={filterState}
        facets={facets}
        resultCount={displayEntries.length}
        showBespokeCta
      >
        {displayEntries.length === 0 ? (
          <div className="status-message catalog-empty-state">
            <p>Ничего не найдено. Попробуйте сбросить часть фильтров.</p>
            <div className="nav-links nav-links-center" style={{ marginTop: "1rem" }}>
              <Link href="/catalog">Показать все</Link>
            </div>
          </div>
        ) : (
          <ul className="product-grid catalog-product-grid">
            {displayEntries.map((entry) => (
              <li key={(entry.product as Record<string, unknown>).id as string}>
                <ProductCard
                  product={entry.product as any}
                  displayGroup={entry.displayGroup}
                />
              </li>
            ))}
          </ul>
        )}
      </CatalogFilterControls>
    </div>
  )
}
