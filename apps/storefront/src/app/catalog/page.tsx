import Link from "next/link"
import { ProductCard } from "@/components/product-card"
import { getProducts } from "@/lib/api/products"

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

  return (
    <div data-state="success">
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
