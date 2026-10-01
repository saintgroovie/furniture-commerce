import Link from "next/link"
import { ErrorBlock, PageHeader } from "@/components/page"
import { dimensionLine, priceLine } from "@/lib/format"
import { loadProducts } from "@/server/loaders"

const FILTERS = [
  ["all", "Все"],
  ["missing_media", "Нет фото"],
  ["missing_price", "Нет цены"],
  ["drafts", "Черновики"],
  ["published_invisible", "Скрыты с витрины"],
] as const

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string; page?: string }>
}) {
  const params = await searchParams
  const filter = params.filter || "all"
  const q = (params.q || "").trim().toLowerCase()
  const page = Math.max(1, Number(params.page || 1) || 1)
  const result = await loadProducts()
  const products = result.ok
    ? result.data.products.filter((product) => {
        if (q && !`${product.title} ${product.skus.join(" ")}`.toLowerCase().includes(q)) return false
        if (filter === "missing_media") return !product.readiness.has_media
        if (filter === "missing_price") return product.classification !== "BESPOKE" && !product.readiness.has_price
        if (filter === "drafts") return product.status !== "published"
        if (filter === "published_invisible") return product.status === "published" && !product.readiness.visible
        return true
      })
    : []
  const pageSize = 24
  const slice = products.slice((page - 1) * pageSize, page * pageSize)
  return (
    <>
      <PageHeader kicker="Каталог" title="Каталог" lead="Тип товара и детская витрина - разные вещи" />
      <form className="filters" action="/catalog">
        <input name="q" defaultValue={params.q || ""} aria-label="Поиск по каталогу" placeholder="Название или SKU" />
        {FILTERS.map(([id, label]) => (
          <Link key={id} href={id === "all" ? "/catalog" : `/catalog?filter=${id}`} aria-current={filter === id ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </form>
      {!result.ok ? <ErrorBlock message={result.message} /> : null}
      {result.ok && slice.length === 0 ? <p className="empty">Ничего не найдено</p> : null}
      <div className="stack">
        {slice.map((product) => (
          <Link key={product.id} href={`/catalog/${product.id}${filter === "missing_price" ? "#price" : filter === "missing_media" ? "#media" : filter === "drafts" || filter === "published_invisible" ? "#publish" : ""}`} className="row-card">
            <div>
              <h2>{product.title}</h2>
              <span className="muted">{product.skus[0] || "SKU нет"} · {dimensionLine(product.dimensions)}</span>
            </div>
            <div className="pills">
              <span className="pill">{product.classification}</span>
              {product.kids_nav ? <span className="pill">Детская витрина</span> : null}
              {!product.readiness.has_media ? <span className="pill warn">Нет фото</span> : <span className="pill ok">Фото есть</span>}
              {product.status === "published" && !product.readiness.visible ? <span className="pill warn">Покупатель не видит</span> : null}
            </div>
            <span>{priceLine(product.price_display)}</span>
          </Link>
        ))}
      </div>
    </>
  )
}
