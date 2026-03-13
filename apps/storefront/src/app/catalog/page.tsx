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

export default async function CatalogPage() {
  let data: { products?: unknown[] } = {}
  try {
    data = await getProducts()
  } catch {
    return (
      <div data-state="error">
        <h1>Каталог</h1>
        <p>Не удалось загрузить каталог.</p>
        <p><Link href="/">На главную</Link></p>
      </div>
    )
  }
  const products = data.products ?? []
  const list = Array.isArray(products) ? products : []

  if (list.length === 0) {
    return (
      <div data-state="empty">
        <h1>Каталог</h1>
        <p>Товары не найдены.</p>
        <p><Link href="/">На главную</Link></p>
      </div>
    )
  }

  const base = getSiteUrl()
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: list.length,
    itemListElement: list.map((p: { id?: string; title?: string }, i: number) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${base}/product/${p.id}`,
      name: (p.title as string) ?? undefined,
    })),
  }

  return (
    <div data-state="success">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <h1>Каталог</h1>
      <p>Фильтры: временный UI.</p>
      <ul style={{ listStyle: "none", display: "flex", flexWrap: "wrap", gap: "1rem" }}>
        {list.map((p: { id?: string }) => (
          <li key={p.id}>
            <ProductCard product={p} />
          </li>
        ))}
      </ul>
    </div>
  )
}
