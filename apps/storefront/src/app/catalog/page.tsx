import Link from "next/link"
import type { Metadata } from "next"
import { ProductCard } from "@/components/product-card"
import { getSiteUrl } from "@/lib/api/base"
import { getProducts } from "@/lib/api/products"
import { resolveKidsProducts } from "@/lib/kids"
import { BESPOKE_PRODUCT_TYPE } from "@/lib/bespoke"

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
      p.product_classification?.product_type !== BESPOKE_PRODUCT_TYPE
  )

  const list = activeType
    ? all.filter((p: any) => p.product_classification?.product_type === activeType)
    : all

  const base = getSiteUrl()
  const itemListJsonLd = list.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: list.length,
    itemListElement: list.map((p: { id?: string; title?: string }, i: number) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${base}/product/${p.id}`,
      name: (p.title as string) ?? undefined,
    })),
  } : null

  return (
    <div data-state={list.length === 0 ? "empty" : "success"}>
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
          Индивидуальный проект →
        </Link>
      </div>

      {list.length === 0 ? (
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
          {list.map((p: { id?: string }) => (
            <li key={p.id}>
              <ProductCard product={p as any} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
