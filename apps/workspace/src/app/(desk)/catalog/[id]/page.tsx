import Link from "next/link"
import { ErrorBlock, PageHeader } from "@/components/page"
import { dimensionLine, priceLine } from "@/lib/format"
import { loadProduct } from "@/server/loaders"

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await loadProduct(id)
  if (!result.ok) return <><PageHeader title="Товар" /><ErrorBlock message={result.message} /></>
  const product = result.data.product
  const blockers = product.publish?.blockers ?? []
  return (
    <>
      <PageHeader kicker="Товар" title={product.title} lead={product.classification === "BESPOKE" ? "По проекту, в корзину не кладётся" : product.subtitle || product.collection_label || ""} />
      <div className="section-grid">
        <section className="card">
          <h2>Готовность</h2>
          <div className="pills">
            <span className="pill">{product.classification}</span>
            {product.kids_nav ? <span className="pill">Детская витрина</span> : null}
            <span className="pill">{product.status === "published" ? "Опубликован" : "Черновик"}</span>
          </div>
          <p>{priceLine(product.price_display)}</p>
          <p>{dimensionLine(product.dimensions)}</p>
          <p>{product.readiness.has_media ? "Кадр есть" : "Нет главного кадра"}</p>
          <p>{product.readiness.visible ? "Покупатель видит" : "На витрине не виден"}</p>
          {blockers.length ? (
            <ul>
              {blockers.map((blocker) => (
                <li key={blocker.code}>{blocker.message}</li>
              ))}
            </ul>
          ) : (
            <p className="pill ok">Блокеров публикации нет</p>
          )}
        </section>
        <aside className="card">
          <h2>Дальше</h2>
          <p className="muted">Цена и публикация сохраняются явным действием в текущем API. Псевдо-скидки здесь нет</p>
          <Link href="/catalog">К каталогу</Link>
        </aside>
      </div>
    </>
  )
}
