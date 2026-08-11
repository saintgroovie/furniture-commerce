import Link from "next/link"
import type { Metadata } from "next"
import type { ComponentProps } from "react"
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

function BespokeCatalogEmpty({
  body = bespokeCatalogCopy.emptyBody,
}: {
  body?: readonly string[]
}) {
  return (
    <div data-state="empty" className="bespoke-catalog-empty">
      <h1>{bespokeCatalogCopy.h1}</h1>
      <div className="status-message bespoke-catalog-empty-body">
        <CopyLines
          className="bespoke-catalog-empty-copy"
          lines={body}
          as="div"
        />
        <div className="nav-links nav-links-center bespoke-catalog-empty-actions">
          <Link href="/bespoke/request" className="btn btn-primary">
            {bespokeCatalogCopy.emptyCtaRequest}
          </Link>
          <Link href="/bespoke" className="btn btn-secondary">
            {bespokeCatalogCopy.emptyCtaSection}
          </Link>
        </div>
      </div>
    </div>
  )
}

export default async function BespokeCatalogPage() {
  let products: Array<Record<string, unknown>> = []

  try {
    const data = await resolveBespokeProducts()
    products = data.products
  } catch (err) {
    console.error("[bespoke/catalog] products load failed", err)
    return <BespokeCatalogEmpty body={bespokeCatalogCopy.loadError} />
  }

  const displayEntries = groupProductsForDisplay(products)

  if (products.length === 0) {
    return <BespokeCatalogEmpty />
  }

  return (
    <div data-state="success">
      <h1>{bespokeCatalogCopy.h1}</h1>
      <p className="info-text" style={{ marginTop: "0.5rem" }}>
        {bespokeCatalogCopy.lead}
      </p>
      <ul className="product-grid" style={{ marginTop: "1.5rem" }}>
        {displayEntries.map((entry) => (
          <li key={(entry.product as { id?: string }).id as string}>
            <ProductCard
              product={entry.product as ComponentProps<typeof ProductCard>["product"]}
              displayGroup={entry.displayGroup}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
