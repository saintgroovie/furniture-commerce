import Link from "next/link"
import type { Metadata } from "next"
import { ProductCard } from "@/components/product-card"
import { CopyLines } from "@/components/copy-lines"
import { resolveBespokeProducts } from "@/lib/bespoke"
import { groupProductsForDisplay } from "@/lib/display-group"
import { bespokeCatalogCopy, seo } from "@/lib/woodright-copy"

export const metadata: Metadata = {
  title: seo.bespokeCatalog.title,
  description: seo.bespokeCatalog.description,
  openGraph: {
    title: seo.bespokeCatalog.title,
    description: seo.bespokeCatalog.description,
    url: "/bespoke/catalog",
  },
}

export default async function BespokeCatalogPage() {
  let products: Array<Record<string, unknown>> = []

  try {
    const data = await resolveBespokeProducts()
    products = data.products
  } catch {
    return (
      <div data-state="error">
        <h1>{bespokeCatalogCopy.h1}</h1>
        <CopyLines
          className="info-text"
          style={{ marginTop: "0.5rem" }}
          lines={bespokeCatalogCopy.loadError}
        />
        <div className="nav-links" style={{ marginTop: "1rem" }}>
          <Link href="/bespoke">В раздел «По проекту»</Link>
        </div>
      </div>
    )
  }

  const displayEntries = groupProductsForDisplay(products)

  if (products.length === 0) {
    return (
      <div data-state="empty">
        <h1>{bespokeCatalogCopy.h1}</h1>
        <div className="status-message">
          <CopyLines lines={bespokeCatalogCopy.emptyBody} />
          <div
            className="nav-links nav-links-center"
            style={{ marginTop: "1rem" }}
          >
            <Link href="/bespoke/request">Заявка на расчёт</Link>
            <Link href="/bespoke">В раздел «По проекту»</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div data-state="success">
      <h1>{bespokeCatalogCopy.h1}</h1>
      <CopyLines
        className="info-text"
        style={{ marginTop: "0.5rem" }}
        lines={bespokeCatalogCopy.lead}
      />
      <ul className="product-grid" style={{ marginTop: "1.5rem" }}>
        {displayEntries.map((entry) => (
          <li key={(entry.product as { id?: string }).id as string}>
            <ProductCard
              product={entry.product as any}
              displayGroup={entry.displayGroup}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
