import Link from "next/link"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { ProductCard } from "@/components/product-card"
import { CatalogBrowseClient } from "@/components/catalog-browse-client"
import { CatalogFilterControls } from "@/components/catalog-filter-controls"
import { getSiteUrl } from "@/lib/api/base"
import { getCatalogProducts } from "@/lib/api/products"
import { toCatalogBrowseClientProducts } from "@/lib/catalog-browse-client-product"
import {
  fetchKidsRoomSetMembership,
  resolveKidsProducts,
} from "@/lib/kids"
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
  buildAllCatalogFacets,
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
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const resolvedSearchParams = await searchParams
  const legacyQs = catalogLegacyTypeRedirectQuery(resolvedSearchParams)
  if (legacyQs) redirect(`/catalog?${legacyQs}`)

  const filterState = parseCatalogFilterState(resolvedSearchParams)
  const bespokeOnly = filterState.type === BESPOKE_PRODUCT_TYPE

  let allRaw: Record<string, unknown>[] = []
  let kidsIds: Set<string>
  try {
    const [storeData, membership] = await Promise.all([
      getCatalogProducts(),
      fetchKidsRoomSetMembership(),
    ])
    const products = storeData.products ?? []
    allRaw = (Array.isArray(products) ? products : []) as Record<
      string,
      unknown
    >[]
    kidsIds = (
      await resolveKidsProducts({
        storeProducts: allRaw,
        membership,
      })
    ).ids
  } catch {
    return (
      <div data-state="error">
        <div className="catalog-hero">
          <h1>{catalogCopy.h1}</h1>
          <CopyLines
            className="info-text"
            style={{ marginTop: "0.5rem" }}
            lines={catalogCopy.loadError}
          />
        </div>
        <div className="nav-links" style={{ marginTop: "1rem" }}>
          <Link href="/">{actions.toHome}</Link>
        </div>
      </div>
    )
  }

  const scopedMain = allRaw.filter((p: Record<string, unknown>) => {
    if (kidsIds.has(p.id as string)) return false
    if (!isProductInMainCatalogScope(p)) return false
    if (isMedusaCanonicalSeedDemoProduct(p)) return false
    const classification = (
      p.product_classification as { product_type?: string } | undefined
    )?.product_type
    return classification !== BESPOKE_PRODUCT_TYPE
  }) as Record<string, unknown>[]

  // Rare URL `?type=BESPOKE`: keep fail-closed SSR path (pool ≠ main browse pool).
  if (bespokeOnly) {
    const scoped = allRaw.filter((p: Record<string, unknown>) => {
      if (kidsIds.has(p.id as string)) return false
      if (!isProductInMainCatalogScope(p)) return false
      if (isMedusaCanonicalSeedDemoProduct(p)) return false
      const classification = (
        p.product_classification as { product_type?: string } | undefined
      )?.product_type
      return classification === BESPOKE_PRODUCT_TYPE
    }) as Record<string, unknown>[]
    const filtered = applyCatalogFilters(scoped, filterState)
    const facets = buildAllCatalogFacets(scoped, filterState)
    const displayEntries = sortDisplayEntries(
      groupProductsForDisplay(filtered),
      filterState.sort
    )
    return (
      <div data-state={displayEntries.length === 0 ? "empty" : "success"}>
        <div className="catalog-hero">
          <h1>{catalogCopy.h1}</h1>
          <p className="info-text">
            {formatRuInline(catalogCopy.lead)}{" "}
            <Link href="/kids/catalog" className="catalog-hero-kids-link">
              {formatRuInline(catalogCopy.kidsLead)}{" "}
              <span aria-hidden="true">→</span>
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
              <div
                className="nav-links nav-links-center"
                style={{ marginTop: "1rem" }}
              >
                <Link href="/catalog">{actions.resetFilters}</Link>
                <Link href="/bespoke/request">{actions.discussProject}</Link>
              </div>
            </div>
          ) : (
            <ul className="product-grid catalog-product-grid">
              {displayEntries.map((entry, index) => (
                <li key={(entry.product as Record<string, unknown>).id as string}>
                  <ProductCard
                    product={entry.product as never}
                    displayGroup={entry.displayGroup}
                    priorityHero={index === 0}
                  />
                </li>
              ))}
            </ul>
          )}
        </CatalogFilterControls>
      </div>
    )
  }

  return (
    <div>
      <div className="catalog-hero">
        <h1>{catalogCopy.h1}</h1>
        <p className="info-text">
          {formatRuInline(catalogCopy.lead)}{" "}
          <Link href="/kids/catalog" className="catalog-hero-kids-link">
            {formatRuInline(catalogCopy.kidsLead)} <span aria-hidden="true">→</span>
          </Link>
        </p>
      </div>

      <CatalogBrowseClient
        basePath="/catalog"
        initialState={filterState}
        products={toCatalogBrowseClientProducts(scopedMain)}
        showBespokeCta
        siteUrl={getSiteUrl()}
        emptyCopy={{
          emptyFilteredTitle: catalogCopy.emptyFilteredTitle,
          emptyFilteredBody: catalogCopy.emptyFilteredBody,
        }}
        emptySecondaryHref="/bespoke/request"
        emptySecondaryLabel={actions.discussProject}
      />
    </div>
  )
}
