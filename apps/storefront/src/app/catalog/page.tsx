import Link from "next/link"
import type { Metadata } from "next"
import { ProductCard } from "@/components/product-card"
import { getSiteUrl } from "@/lib/api/base"
import { getProducts } from "@/lib/api/products"
import { resolveKidsProducts } from "@/lib/kids"
import { BESPOKE_PRODUCT_TYPE } from "@/lib/bespoke"
import { groupProductsForDisplay } from "@/lib/display-group"
import {
  isMedusaCanonicalSeedDemoProduct,
  isProductInActiveCatalogScope,
} from "@/lib/catalog-scope"

export const metadata: Metadata = {
  title: "Каталог",
  description: "Каталог мебели Woodright. Готовые товары и товары с вариациями.",
  openGraph: {
    title: "Каталог мебели | Woodright",
    description: "Каталог мебели Woodright. Готовые товары и товары с вариациями.",
    url: "/catalog",
  },
}

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  STANDARD: "Готовые",
  CONFIGURABLE: "С выбором исполнения",
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: { product_type?: string }
}) {
  const activeType = searchParams.product_type ?? null

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
    kidsIds = (await resolveKidsProducts()).ids
  } catch {
    kidsIds = new Set()
  }
  const all = allRaw.filter(
    (p: any) =>
      !kidsIds.has(p.id) &&
      p.product_classification?.product_type !== BESPOKE_PRODUCT_TYPE &&
      isProductInActiveCatalogScope(p as Record<string, unknown>) &&
      !isMedusaCanonicalSeedDemoProduct(p as Record<string, unknown>)
  )

  const filtered = activeType
    ? all.filter((p: any) => p.product_classification?.product_type === activeType)
    : all

  const displayEntries = groupProductsForDisplay(filtered as Record<string, unknown>[])

  const base = getSiteUrl()
  const itemListJsonLd = displayEntries.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: displayEntries.length,
    itemListElement: displayEntries.map((entry, i: number) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${base}/product/${(entry.product as any).id}`,
      name: ((entry.product as any).title as string) ?? undefined,
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

      <div className="catalog-controls" style={{ marginTop: "1rem" }}>
        <nav className="filter-tabs" aria-label="Фильтр по типу">
          <Link
            href="/catalog"
            className={activeType === null ? "filter-tab filter-tab-active" : "filter-tab"}
          >
            Все
          </Link>
          {Object.entries(PRODUCT_TYPE_LABELS).map(([key, label]) => (
            <Link
              key={key}
              href={`/catalog?product_type=${key}`}
              className={activeType === key ? "filter-tab filter-tab-active" : "filter-tab"}
            >
              {label}
            </Link>
          ))}
        </nav>
        <Link href="/bespoke" className="catalog-cta">
          По проекту →
        </Link>
      </div>

      {displayEntries.length === 0 ? (
        <div className="status-message">
          <p>Товары не найдены.</p>
          {activeType && (
            <div className="nav-links nav-links-center" style={{ marginTop: "1rem" }}>
              <Link href="/catalog">Показать все</Link>
            </div>
          )}
        </div>
      ) : (
        <ul className="product-grid">
          {displayEntries.map((entry) => (
            <li key={(entry.product as any).id}>
              <ProductCard
                product={entry.product as any}
                displayGroup={entry.displayGroup}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
