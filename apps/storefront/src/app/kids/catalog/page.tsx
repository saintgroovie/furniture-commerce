import Link from "next/link"
import type { Metadata } from "next"
import { CatalogBrowseClient } from "@/components/catalog-browse-client"
import { CatalogItemListJsonLd } from "@/components/catalog-item-list-json-ld"
import { getSiteUrl } from "@/lib/api/base"
import { getCatalogProducts } from "@/lib/api/products"
import { toCatalogBrowseClientProducts } from "@/lib/catalog-browse-client-product"
import {
  catalogBrowseDisplayEntries,
  collectAtfBrowseProducts,
  scopeCatalogBrowsePool,
} from "@/lib/catalog-browse-pool"
import {
  fetchKidsRoomSetMembership,
  resolveKidsProducts,
} from "@/lib/kids"
import { parseCatalogFilterState } from "@/lib/catalog-filter-params"
import { actions, kidsCatalogCopy, seo } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"

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
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const resolvedSearchParams = await searchParams
  const filterState = parseCatalogFilterState(resolvedSearchParams)

  let scoped: Array<Record<string, unknown>> = []

  try {
    const [storeData, membership] = await Promise.all([
      getCatalogProducts(),
      fetchKidsRoomSetMembership(),
    ])
    const storeProducts = (storeData.products ?? []) as Array<
      Record<string, unknown>
    >
    const kidsData = await resolveKidsProducts({ storeProducts, membership })
    scoped = scopeCatalogBrowsePool(
      storeProducts,
      "kids",
      Array.from(kidsData.ids)
    )
  } catch {
    return (
      <div data-state="error">
        <div className="catalog-hero">
          <h1>{kidsCatalogCopy.h1}</h1>
          <CopyLines className="info-text" lines={kidsCatalogCopy.loadError} />
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
          <CopyLines lines={kidsCatalogCopy.emptyBody} />
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

  const browseProducts = toCatalogBrowseClientProducts(scoped)
  const siteUrl = getSiteUrl()
  const kidsProductIds = scoped
    .map((p) => String(p.id ?? ""))
    .filter(Boolean)

  return (
    <div>
      <div className="catalog-hero">
        <h1>{kidsCatalogCopy.h1}</h1>
        <CopyLines className="info-text" lines={kidsCatalogCopy.lead} />
      </div>

      <CatalogItemListJsonLd
        siteUrl={siteUrl}
        entries={catalogBrowseDisplayEntries(browseProducts, filterState)}
      />
      <CatalogBrowseClient
        basePath="/kids/catalog"
        initialState={filterState}
        atfProducts={collectAtfBrowseProducts(browseProducts, filterState)}
        poolScope="kids"
        kidsProductIds={kidsProductIds}
        showBespokeCta
        emptyCopy={{
          emptyFilteredTitle: kidsCatalogCopy.emptyTitle,
          emptyFilteredBody: kidsCatalogCopy.emptyBody,
        }}
      />
    </div>
  )
}
