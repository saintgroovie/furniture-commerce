import Link from "next/link"
import { ObjectRow, Thumb } from "@/components/object-row"
import { Card, EmptyState, ErrorBlock, ModeTabs, PageHeader } from "@/components/page"
import { StateBadge } from "@/components/status"
import { priceLine } from "@/lib/format"
import { CATALOG_MODES } from "@/lib/nav"
import { classificationLabel, productProblem, publicationState, readinessChecklist, readinessSummary } from "@/lib/product-presentation"
import { loadProducts } from "@/server/loaders"

const FILTERS = [
  ["all", "Все"],
  ["missing_price", "Нет цены"],
  ["missing_media", "Нет фото"],
  ["drafts", "Черновики"],
  ["published_invisible", "Покупатель не видит"],
] as const

/**
 * Product list. One row = one product; the row opens the object.
 * Problems are shown as text states, never as a bare dot.
 */
export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string; page?: string }>
}) {
  const params = await searchParams
  const filter = FILTERS.some(([id]) => id === params.filter) ? (params.filter as string) : "all"
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
  const pages = Math.max(1, Math.ceil(products.length / pageSize))
  const anchor = filter === "missing_price" ? "#price" : filter === "missing_media" ? "#media" : filter === "drafts" || filter === "published_invisible" ? "#publish" : ""
  return (
    <>
      <PageHeader kicker="Товары" title="Товары" lead={result.ok ? `${products.length} в этом срезе` : undefined} right={<ModeTabs items={CATALOG_MODES} active="products" />} />
      <form className="filters" action="/catalog" role="search">
        {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
        <input name="q" defaultValue={params.q || ""} aria-label="Поиск по товарам" placeholder="Название или SKU" />
        {FILTERS.map(([id, label]) => (
          <Link key={id} href={id === "all" ? `/catalog${q ? `?q=${encodeURIComponent(params.q || "")}` : ""}` : `/catalog?filter=${id}${q ? `&q=${encodeURIComponent(params.q || "")}` : ""}`} aria-current={filter === id ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </form>
      {!result.ok ? <ErrorBlock message={result.message} /> : null}
      {result.ok && slice.length === 0 ? (
        <Card>
          <EmptyState title="Ничего не найдено" hint={q ? "Попробуйте другой запрос или снимите фильтр" : "В этом срезе товаров нет"} href="/catalog" linkLabel="Все товары" />
        </Card>
      ) : null}
      {slice.length > 0 ? (
        <div className="card list">
          {slice.map((product) => {
            const problem = productProblem(product)
            const checklist = readinessChecklist(product)
            const summary = readinessSummary(checklist)
            return (
              <ObjectRow
                key={product.id}
                href={`/catalog/${product.id}${anchor}`}
                leading={<Thumb src={product.thumbnail} />}
                title={product.title}
                meta={[product.skus[0] || "SKU нет", classificationLabel(product.classification), product.kids_nav ? "детская навигация" : null, product.classification === "BESPOKE" ? "цена в заявке" : priceLine(product.price_display), `готовность ${summary.done} из ${summary.total}`].filter(Boolean).join(" · ")}
                end={
                  <>
                    {problem ? <StateBadge state={problem} /> : null}
                    <StateBadge state={publicationState(product)} />
                  </>
                }
              />
            )
          })}
        </div>
      ) : null}
      {pages > 1 ? (
        <nav className="filters" aria-label="Страницы">
          {Array.from({ length: pages }, (_, index) => index + 1).map((n) => (
            <Link key={n} href={`/catalog?${new URLSearchParams({ ...(filter !== "all" ? { filter } : {}), ...(params.q ? { q: params.q } : {}), page: String(n) }).toString()}`} aria-current={n === page ? "page" : undefined}>
              {n}
            </Link>
          ))}
        </nav>
      ) : null}
    </>
  )
}
