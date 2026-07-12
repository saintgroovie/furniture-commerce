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
import { actions, catalogCopy, seo } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"
import { formatRuInline } from "@/lib/format-ru-copy"

export const metadata: Metadata = {
  title: seo.catalog.title,
  description: seo.catalog.description,
  openGraph: {
    title: seo.catalog.title,
    description: seo.catalog.description,
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
  const bespokeOnly = filterState.type === BESPOKE_PRODUCT_TYPE

  let data: { products?: unknown[] } = {}
  try {
    data = await getProducts()
  } catch {
    return (
      <div data-state="error">
        <div className="catalog-hero">
          <h1>{catalogCopy.h1}</h1>
          <CopyLines className="info-text" style={{ marginTop: "0.5rem" }} lines={catalogCopy.loadError} />
        </div>
        <div className="nav-links" style={{ marginTop: "1rem" }}>
          <Link href="/">{actions.toHome}</Link>
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
  const scoped = allRaw.filter((p: Record<string, unknown>) => {
    if (kidsIds.has(p.id as string)) return false
    if (!isProductInMainCatalogScope(p)) return false
    if (isMedusaCanonicalSeedDemoProduct(p)) return false
    const classification = (
      p.product_classification as { product_type?: string } | undefined
    )?.product_type
    if (bespokeOnly) {
      // Fail-closed: known BESPOKE filter never falls back to STANDARD/CONFIGURABLE pool.
      return classification === BESPOKE_PRODUCT_TYPE
    }
    return classification !== BESPOKE_PRODUCT_TYPE
  }) as Record<string, unknown>[]

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

      <div className="catalog-hero">
        <h1>{catalogCopy.h1}</h1>
        <p className="info-text">
          {formatRuInline(catalogCopy.lead)}{" "}
          <Link href="/kids/catalog" className="catalog-hero-kids-link">
            {formatRuInline(catalogCopy.kidsLead)} <span aria-hidden="true">→</span>
          </Link>
        </p>
      </div>

      <CatalogFilterControls
        basePath="/catalog"
        state={filterState}
        facets={facets}
        resultCount={displayEntries.length}
        showBespokeCta
      >
        {displayEntries.length === 0 ? (
          <div className="status-message catalog-empty-state">
            <p style={{ fontWeight: 500 }}>{catalogCopy.emptyFilteredTitle}</p>
            <CopyLines lines={catalogCopy.emptyFilteredBody} />
            <div className="nav-links nav-links-center" style={{ marginTop: "1rem" }}>
              <Link href="/catalog">{actions.resetFilters}</Link>
              <Link href="/bespoke/request">{actions.discussProject}</Link>
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
