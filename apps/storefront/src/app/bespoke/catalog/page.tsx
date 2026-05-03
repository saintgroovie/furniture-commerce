import Link from "next/link"
import type { Metadata } from "next"
import { ProductCard } from "@/components/product-card"
import { resolveBespokeProducts } from "@/lib/bespoke"
import { groupProductsForDisplay } from "@/lib/display-group"

export const metadata: Metadata = {
  title: "Каталог",
  description:
    "Мебель по проекту Woodright. Кухни, гардеробные, шкафы — индивидуальные проекты.",
  openGraph: {
    title: "По проекту — каталог | Woodright",
    description: "Кухни, гардеробные, шкафы — индивидуальные проекты.",
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
        <h1>Мебель по проекту</h1>
        <p className="info-text" style={{ marginTop: "0.5rem" }}>
          Не удалось загрузить каталог.
        </p>
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
        <h1>Мебель по проекту</h1>
        <div className="status-message">
          <p>Товары пока не добавлены.</p>
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
      <h1>Мебель по проекту</h1>
      <p className="info-text" style={{ marginTop: "0.5rem" }}>
        Кухни, гардеробные, шкафы и другие проекты по индивидуальным размерам.
      </p>
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
