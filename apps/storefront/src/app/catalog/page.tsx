import Link from "next/link"
import type { Metadata } from "next"
import { ProductCard } from "@/components/product-card"
import { getSiteUrl } from "@/lib/api/base"
import { getProducts } from "@/lib/api/products"

export const metadata: Metadata = {
  title: "Каталог",
  description: "Каталог мебели Woodright. Стандартные и конфигурируемые товары, мебель на заказ.",
  openGraph: {
    title: "Каталог мебели | Woodright",
    description: "Каталог мебели Woodright. Стандартные и конфигурируемые товары.",
    url: "/catalog",
  },
}

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  STANDARD: "Стандартные",
  CONFIGURABLE: "Конфигурируемые",
  BESPOKE: "На заказ",
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: { product_type?: string }
}) {
  const activeType = searchParams.product_type ?? null

  let data: { products?: unknown[] } = {}
  try {
    data = await getProducts(activeType ? { product_type: activeType } : undefined)
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
  const list = Array.isArray(products) ? products : []

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

      <nav className="filter-tabs" style={{ marginTop: "1rem" }} aria-label="Фильтр по типу">
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
