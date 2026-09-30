import { ErrorBlock, PageHeader } from "@/components/page"
import { loadPromo } from "@/server/loaders"

export default async function PromoPage() {
  const result = await loadPromo()
  return (
    <>
      <PageHeader kicker="Акции" title="Акция в каталоге" lead="Слот выбирает, что показать. Цену задаёт прайс-лист Medusa" />
      {!result.ok ? <ErrorBlock message={result.message} /> : null}
      {result.ok ? (
        <section className="card">
          <p>{result.data.slot.enabled ? "Слот включён" : "Слот выключен"}</p>
          <p className="muted">{result.data.slot.label || "Подписи нет"}</p>
          <p className="muted">Прайс-лист: {result.data.price_list.title || "не найден"} · {result.data.price_list.active_now ? "сейчас действует" : "сейчас не действует"}</p>
          <ul>
            {result.data.products.map((product) => (
              <li key={product.product_id}>
                {product.title}
                {product.sku ? ` · ${product.sku}` : ""}
                {product.blocker ? ` · ${product.blocker}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}
