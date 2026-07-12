import Link from "next/link"
import type { Metadata } from "next"
import { CatalogBrowseClient } from "@/components/catalog-browse-client"
import { getSiteUrl } from "@/lib/api/base"
import { getCatalogProducts } from "@/lib/api/products"
import { toCatalogBrowseClientProducts } from "@/lib/catalog-browse-client-product"
import {
  fetchKidsRoomSetMembership,
  resolveKidsProducts,
} from "@/lib/kids"
import { isProductInActiveCatalogScope } from "@/lib/catalog-scope"
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
  searchParams: Record<string, string | string[] | undefined>
}) {
  const filterState = parseCatalogFilterState(searchParams)

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
    scoped = kidsData.products.filter((p) => isProductInActiveCatalogScope(p))
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

  return (
    <div>
      <div className="catalog-hero">
        <h1>{kidsCatalogCopy.h1}</h1>
        <CopyLines className="info-text" lines={kidsCatalogCopy.lead} />
      </div>

      <CatalogBrowseClient
        basePath="/kids/catalog"
        initialState={filterState}
        products={toCatalogBrowseClientProducts(scoped)}
        showBespokeCta
        siteUrl={getSiteUrl()}
        emptyCopy={{
          emptyFilteredTitle: kidsCatalogCopy.emptyTitle,
          emptyFilteredBody: kidsCatalogCopy.emptyBody,
        }}
      />
    </div>
  )
}
