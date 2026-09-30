import Link from "next/link"
import { ErrorBlock, PageHeader } from "@/components/page"
import { loadProducts } from "@/server/loaders"

export default async function MediaPage() {
  const result = await loadProducts()
  const rows = result.ok ? result.data.products.filter((product) => !product.readiness.has_media).slice(0, 40) : []
  return (
    <>
      <PageHeader kicker="Медиа" title="Нужен кадр" lead="Очередь товаров без главного фото" />
      {!result.ok ? <ErrorBlock message={result.message} /> : null}
      {result.ok && rows.length === 0 ? <p className="empty">Всему списку хватает фото</p> : null}
      <div className="stack">
        {rows.map((product) => (
          <Link key={product.id} href={`/catalog/${product.id}`} className="row-card">
            <h2>{product.title}</h2>
            <span className="muted">{product.skus[0] || "SKU нет"}</span>
            <span className="pill warn">Нет hero</span>
          </Link>
        ))}
      </div>
    </>
  )
}
