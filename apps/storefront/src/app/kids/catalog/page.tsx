import Link from "next/link"
import type { Metadata } from "next"
import { ProductCard } from "@/components/product-card"
import { resolveKidsProducts } from "@/lib/kids"
import { groupProductsForDisplay } from "@/lib/display-group"
import { isProductInActiveCatalogScope } from "@/lib/catalog-scope"

export const metadata: Metadata = {
  title: "Каталог",
  description:
    "Мебель для детских комнат Woodright. Товары из готовых детских комплектов.",
  openGraph: {
    title: "Каталог детской мебели | Woodright",
    description: "Мебель для детских комнат из готовых комплектов.",
    url: "/kids/catalog",
  },
}

export default async function KidsCatalogPage() {
  let products: Array<Record<string, unknown>> = []

  try {
    const kidsData = await resolveKidsProducts()
    products = kidsData.products.filter((p) =>
      isProductInActiveCatalogScope(p)
    )
  } catch {
    return (
      <div data-state="error">
        <h1>Мебель для детской</h1>
        <p className="info-text" style={{ marginTop: "0.5rem" }}>
          Не удалось загрузить каталог.
        </p>
        <div className="nav-links" style={{ marginTop: "1rem" }}>
          <Link href="/kids">В детскую секцию</Link>
        </div>
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div data-state="empty">
        <h1>Мебель для детской</h1>
        <div className="status-message">
          <p>Товары пока не добавлены.</p>
          <div
            className="nav-links nav-links-center"
            style={{ marginTop: "1rem" }}
          >
            <Link href="/kids/rooms">Готовые комнаты</Link>
            <Link href="/kids">В детскую секцию</Link>
          </div>
        </div>
      </div>
    )
  }

  const displayEntries = groupProductsForDisplay(products)

  return (
    <div data-state="success">
      <h1>Мебель для детской</h1>
      <p className="info-text" style={{ marginTop: "0.5rem" }}>
        Подборка мебели из наших готовых комплектов для детских комнат.
      </p>
      <ul className="product-grid" style={{ marginTop: "1.5rem" }}>
        {displayEntries.map((entry) => (
          <li key={(entry.product as any).id as string}>
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
