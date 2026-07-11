import Link from "next/link"
import type { Metadata } from "next"
import { ProductCard } from "@/components/product-card"
import { CatalogFilterControls } from "@/components/catalog-filter-controls"
import { getProducts } from "@/lib/api/products"
import { resolveKidsProducts } from "@/lib/kids"
import { groupProductsForDisplay } from "@/lib/display-group"
import { isProductInActiveCatalogScope } from "@/lib/catalog-scope"
import { parseCatalogFilterState } from "@/lib/catalog-filter-params"
import {
  applyCatalogFilters,
  buildCatalogFacets,
  sortDisplayEntries,
} from "@/lib/catalog-filters"
import { actions, kidsCatalogCopy, seo } from "@/lib/woodright-copy"

export const metadata: Metadata = {
  title: seo.kidsCatalog.title,
  description: seo.kidsCatalog.description,
  openGraph: {
    title: seo.kidsCatalog.title,
    description: seo.kidsCatalog.description,
    url: "/kids/catalog",
  },
}

export default async function KidsCatalogPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const filterState = parseCatalogFilterState(searchParams)

  let scoped: Array<Record<string, unknown>> = []

  try {
    const storeData = await getProducts()
    const storeProducts = (storeData.products ?? []) as Array<Record<string, unknown>>
    const kidsData = await resolveKidsProducts({ storeProducts })
    scoped = kidsData.products.filter((p) => isProductInActiveCatalogScope(p))
  } catch {
    return (
      <div data-state="error">
        <div className="catalog-hero">
          <h1>{kidsCatalogCopy.h1}</h1>
          <p className="info-text">{kidsCatalogCopy.loadError}</p>
        </div>
        <div className="nav-links" style={{ marginTop: "1rem" }}>
          <Link href="/kids">В детскую секцию</Link>
        </div>
      </div>
    )
  }

  if (scoped.length === 0) {
    return (
      <div data-state="empty">
        <div className="catalog-hero">
          <h1>{kidsCatalogCopy.h1}</h1>
        </div>
        <div className="status-message">
          <p style={{ fontWeight: 500 }}>{kidsCatalogCopy.emptyTitle}</p>
          <p>{kidsCatalogCopy.emptyBody}</p>
          <div
            className="nav-links nav-links-center"
            style={{ marginTop: "1rem" }}
          >
            <Link href="/kids/rooms">Готовые комнаты</Link>
            <Link href="/bespoke/request">{actions.discussProject}</Link>
          </div>
        </div>
      </div>
    )
  }

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

  return (
    <div data-state={displayEntries.length === 0 ? "empty" : "success"}>
      <div className="catalog-hero">
        <h1>{kidsCatalogCopy.h1}</h1>
        <p className="info-text">{kidsCatalogCopy.lead}</p>
      </div>

      <CatalogFilterControls
        basePath="/kids/catalog"
        state={filterState}
        facets={facets}
        resultCount={displayEntries.length}
        showBespokeCta
      >
        {displayEntries.length === 0 ? (
          <div className="status-message catalog-empty-state">
            <p style={{ fontWeight: 500 }}>{kidsCatalogCopy.emptyTitle}</p>
            <p>{kidsCatalogCopy.emptyBody}</p>
            <div className="nav-links nav-links-center" style={{ marginTop: "1rem" }}>
              <Link href="/kids/catalog">{actions.resetFilters}</Link>
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
